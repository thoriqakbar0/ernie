import type {
  DaemonAgentConnection,
  DaemonClient,
  DaemonCommand,
  DaemonResponse,
} from 'prime-agent' with { 'resolution-mode': 'import' };
import { readFile } from 'node:fs/promises';
import { Effect, Predicate, Schedule, Stream } from 'effect';
import { parseJsonValue, type JsonValue } from '../../json-value/index.js';

import type {
  PrimeAgentDaemon,
  PrimeAgentDaemonConfiguration,
  PrimeAgentFailureCode,
  PrimeAgentResult,
  PrimeAgentSession,
  PrimeAgentSessionRenameReceipt,
} from '../types.js';
import { startPrimeAgentDaemonProcess } from './daemon-process.js';
import {
  createPrimeAgentControlClient,
  type PrimeAgentControlTransport,
} from './control-client.js';
import {
  parseActiveSessionId,
  parseCreatedSessionData,
  parseModelCatalogData,
  parseModelData,
  parseModelSelection,
  parseRefinementRequest,
  parseRlmDepthData,
  parseRlmDepthSelection,
  parseSavedSessionListData,
  parseSavedSessionPath,
  parseSessionCreation,
  parseSessionRename,
  parseSessionListData,
  parseSkillResourceCatalogData,
  parseTaskSubmission,
} from './protocol.js';
import { createPrimeAgentSessionFeed } from './session-feed.js';
import { createPrimeAgentWorkspaceFeed } from './workspace-feed.js';

const connectTimeoutMs = 3_000;
const daemonProbeTimeoutMs = 250;
const daemonStartupAttempts = 400;
const requestTimeoutMs = 10_000;
const refinementRequestTimeoutMs = 10 * 60 * 1_000;
const daemonReconnectTimeoutMs = 120_000;

function failure(
  code: PrimeAgentFailureCode,
  message: string,
): PrimeAgentResult<never> {
  return { ok: false, error: { code, message } };
}

function responseData(response: DaemonResponse): PrimeAgentResult<JsonValue> {
  if (!response.success) {
    if (response.errorInfo?.code === 'command_result_uncertain') {
      return failure(
        'outcome_uncertain',
        'Prime Agent received the command, but its final result is uncertain.',
      );
    }
    return failure('request_failed', 'Prime Agent could not complete the request.');
  }
  if (!('data' in response)) return { ok: true, value: null };
  const value = parseJsonValue(response.data);
  return value === undefined
    ? failure('protocol_error', 'Prime Agent returned non-serializable data.')
    : { ok: true, value };
}

interface ErrorMetadata {
  readonly name: string;
  readonly code: string | null;
}

function errorMetadata(cause: unknown): ErrorMetadata {
  if (!Predicate.isError(cause)) return { name: 'NonError', code: null };
  const code = 'code' in cause && Predicate.isString(cause.code)
    ? cause.code
    : null;
  return { name: cause.name, code };
}

function reportOperationalFailure(scope: string, cause: unknown): void {
  console.error(scope, errorMetadata(cause));
}

interface PrimeAgentDaemonRuntime {
  readonly attachSession: (
    client: DaemonClient,
    activeSessionId: string,
    recoverDaemon: () => Promise<void>,
  ) => Promise<DaemonAgentConnection>;
  readonly createClient: () => DaemonClient;
  readonly socketPath: string;
}

type SessionOpenRequest =
  | Readonly<{
      type: 'new';
      cwd: string;
      rlmMaxDepth: number;
    }>
  | Readonly<{ type: 'saved'; sessionPath: string }>;

export function createPrimeAgentDaemon(
  configuration: PrimeAgentDaemonConfiguration,
): PrimeAgentDaemon {
  const normalizedCwd = configuration.currentCwd.trim();
  if (normalizedCwd.length === 0) {
    throw new Error('The current workspace path must not be empty.');
  }
  if (
    configuration.daemonEntrypointPath.trim().length === 0 ||
    configuration.executablePath.trim().length === 0 ||
    configuration.sessionNameExtensionPath.trim().length === 0 ||
    configuration.sessionDirectoryPath?.trim().length === 0
  ) {
    throw new Error('Prime Agent process and extension paths must not be empty.');
  }
  const loadRuntime = Effect.tryPromise(() => import('prime-agent')).pipe(
    Effect.map(
      ({
        DaemonAgentConnection: DaemonAgentConnectionConstructor,
        DaemonClient: DaemonClientConstructor,
        defaultDaemonSocketPath,
      }) => {
        const socketPath =
          configuration.socketPath ?? defaultDaemonSocketPath();
        return {
          attachSession: (client, activeSessionId, recoverDaemon) =>
            DaemonAgentConnectionConstructor.attach(client, activeSessionId, {
              closeClientOnDispose: true,
              recoverDaemon,
              supportsExtensionUi: false,
            }),
          socketPath,
          createClient: () => new DaemonClientConstructor(socketPath),
        } satisfies PrimeAgentDaemonRuntime;
      },
    ),
  );

  const probeDaemon = (runtime: PrimeAgentDaemonRuntime) =>
    Effect.acquireUseRelease(
      Effect.sync(runtime.createClient),
      (client) =>
        Effect.tryPromise(() => client.connect(daemonProbeTimeoutMs)),
      (client) => Effect.sync(() => client.close()),
    );

  const establishDaemonReadiness = loadRuntime.pipe(
    Effect.flatMap((runtime) =>
      probeDaemon(runtime).pipe(
        Effect.catch(() =>
          startPrimeAgentDaemonProcess(configuration, runtime.socketPath).pipe(
            Effect.andThen(
              probeDaemon(runtime).pipe(
                Effect.retry({
                  times: daemonStartupAttempts - 1,
                  schedule: Schedule.fixed('25 millis'),
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  const [ensureDaemonReady, invalidateDaemonReadiness] = Effect.runSync(
    Effect.cachedInvalidateWithTTL(establishDaemonReadiness, '1 second'),
  );
  const recoverDaemon = () =>
    Effect.runPromise(
      invalidateDaemonReadiness.pipe(Effect.andThen(ensureDaemonReady)),
    );
  const controlClient = createPrimeAgentControlClient({
    connectTimeoutMs,
    createTransport: async () => {
      const runtime = await Effect.runPromise(loadRuntime);
      return runtime.createClient();
    },
    recoverDaemon,
    reconnectTimeoutMs: daemonReconnectTimeoutMs,
    reportFailure: reportOperationalFailure,
  });

  const openSessionConnection = (activeSessionId: string) =>
    ensureDaemonReady.pipe(
      Effect.andThen(loadRuntime),
      Effect.flatMap((runtime) =>
        Effect.tryPromise(async () => {
          const client = runtime.createClient();
          try {
            await client.connect(connectTimeoutMs);
            return await runtime.attachSession(
              client,
              activeSessionId,
              recoverDaemon,
            );
          } catch (cause) {
            client.close();
            throw cause;
          }
        }),
      ),
    );

  function withClient<T>(
    operation: (
      client: PrimeAgentControlTransport,
    ) => Effect.Effect<PrimeAgentResult<T>, unknown>,
  ): Effect.Effect<PrimeAgentResult<T>> {
    return controlClient.use(operation).pipe(
      Effect.catch((error) =>
        invalidateDaemonReadiness.pipe(
          Effect.andThen(
            Effect.sync(() => {
              reportOperationalFailure(
                controlClient.state() === 'ready'
                  ? 'Prime Agent request failed.'
                  : 'Prime Agent connection failed.',
                error,
              );
              return controlClient.state() === 'ready'
                ? failure(
                    'request_failed',
                    'Prime Agent could not complete the request.',
                  )
                : failure(
                    'daemon_unavailable',
                    'Ernie could not start the Prime Agent daemon.',
                  );
            }),
          ),
        ),
      ),
    );
  }

  const listWorkspace = Effect.fn('PrimeAgentDaemon.listWorkspace')(() =>
    withClient((client) =>
      Effect.tryPromise(() =>
        client.request({ type: 'list' }, requestTimeoutMs),
      ).pipe(
        Effect.map(responseData),
        Effect.map((response) => {
          if (!response.ok) return response;

          const sessions = parseSessionListData(response.value);
          if (!sessions.ok) return sessions;

          const ordered = [...sessions.value].sort((left, right) => {
            const leftLocal = left.cwd === normalizedCwd ? 1 : 0;
            const rightLocal = right.cwd === normalizedCwd ? 1 : 0;
            if (leftLocal !== rightLocal) return rightLocal - leftLocal;
            return (right.modifiedAt ?? '').localeCompare(
              left.modifiedAt ?? '',
            );
          });

          return {
            ok: true,
            value: { currentCwd: normalizedCwd, sessions: ordered },
          };
        }),
      ),
    ),
  );

  const workspaceFeed = () =>
    createPrimeAgentWorkspaceFeed({
      connectionState: controlClient.state,
      listWorkspace,
      subscribeControl: controlClient.subscribe,
    });

  const listModels = Effect.fn('PrimeAgentDaemon.listModels')(
    (activeSessionId: JsonValue) => {
      const parsedSessionId = parseActiveSessionId(activeSessionId);
      if (!parsedSessionId.ok) return Effect.succeed(parsedSessionId);

      return withClient((client) =>
        Effect.tryPromise(() =>
          client.request(
            {
              type: 'get_model_catalog',
              activeSessionId: parsedSessionId.value,
            },
            requestTimeoutMs,
          ),
        ).pipe(
          Effect.map(responseData),
          Effect.map((response) =>
            response.ok ? parseModelCatalogData(response.value) : response,
          ),
        ),
      );
    },
  );

  const listSkills = Effect.fn('PrimeAgentDaemon.listSkills')(
    (activeSessionId: JsonValue) => {
      const parsedSessionId = parseActiveSessionId(activeSessionId);
      if (!parsedSessionId.ok) return Effect.succeed(parsedSessionId);

      return withClient((client) =>
        Effect.gen(function* () {
          const response = responseData(
            yield* Effect.tryPromise(() =>
              client.request(
                {
                  type: 'get_resource_snapshot',
                  activeSessionId: parsedSessionId.value,
                },
                requestTimeoutMs,
              ),
            ),
          );
          if (!response.ok) return response;

          const catalog = parseSkillResourceCatalogData(response.value);
          if (!catalog.ok) return catalog;

          const loadedSkills = yield* Effect.forEach(
            catalog.value,
            (skill) =>
              Effect.tryPromise(() => readFile(skill.filePath, 'utf8')).pipe(
                Effect.catch((cause) =>
                  Effect.sync(() => {
                    reportOperationalFailure(
                      'Prime Agent skill file could not be read.',
                      cause,
                    );
                    return null;
                  }),
                ),
                Effect.map((content) =>
                  content === null
                    ? null
                    : {
                        command: `/skill:${skill.name}`,
                        content,
                        description: skill.description,
                        name: skill.name,
                      },
                ),
              ),
            { concurrency: 8 },
          );
          const skills = loadedSkills.filter(
            (skill): skill is NonNullable<typeof skill> => skill !== null,
          );
          return { ok: true, value: skills } as const;
        }),
      );
    },
  );

  const sessionFeed = (activeSessionId: JsonValue) => {
    const parsedSessionId = parseActiveSessionId(activeSessionId);
    if (!parsedSessionId.ok) {
      return Stream.succeed({
        kind: 'closed' as const,
        failure: parsedSessionId.error,
      });
    }
    return createPrimeAgentSessionFeed(parsedSessionId.value, {
      openConnection: openSessionConnection,
      reportFailure: reportOperationalFailure,
    });
  };

  const listSavedSessions = Effect.fn(
    'PrimeAgentDaemon.listSavedSessions',
  )(() =>
    withClient((client) =>
      Effect.tryPromise(() =>
        client.request(
          {
            type: 'list_saved_sessions',
            cwd: normalizedCwd,
            scope: 'all',
          },
          30_000,
        ),
      ).pipe(
        Effect.map(responseData),
        Effect.map((response) =>
          response.ok ? parseSavedSessionListData(response.value) : response,
        ),
      ),
    ),
  );

  function openSession(
    request: SessionOpenRequest,
  ): Effect.Effect<PrimeAgentResult<PrimeAgentSession>> {
    let command: Extract<DaemonCommand, { type: 'create' }>;
    if (request.type === 'new') {
      const newSessionConfig: NonNullable<
        Extract<DaemonCommand, { type: 'create' }>['config']
      > = {
        cwd: request.cwd,
        extensions: [configuration.sessionNameExtensionPath],
      };
      if (configuration.sessionDirectoryPath !== undefined) {
        newSessionConfig.sessionDir = configuration.sessionDirectoryPath;
      }
      command = {
        type: 'create',
        config: newSessionConfig,
        lifecycle: 'resident',
      };
    } else {
      command = {
        type: 'create',
        sessionPath: request.sessionPath,
        config: {
          extensions: [configuration.sessionNameExtensionPath],
        },
        lifecycle: 'resident',
      };
    }

    return controlClient
      .use((activeClient) =>
        Effect.gen(function* () {
          const rawCreateResponse = yield* Effect.tryPromise(() =>
            activeClient.request(command, requestTimeoutMs),
          );
          const createResponse = responseData(rawCreateResponse);
          if (!createResponse.ok) return createResponse;

          const session = parseCreatedSessionData(createResponse.value);
          if (!session.ok) return session;

          if (request.type === 'new') {
            const rawDepthResponse = yield* Effect.tryPromise(() =>
              activeClient.request(
                {
                  type: 'set_rlm_max_depth',
                  activeSessionId: session.value.activeSessionId,
                  maxDepth: request.rlmMaxDepth,
                },
                requestTimeoutMs,
              ),
            );
            const depthResponse = responseData(rawDepthResponse);
            if (!depthResponse.ok) return depthResponse;

            const depth = parseRlmDepthData(depthResponse.value);
            if (!depth.ok) return depth;
            if (depth.value.maxDepth !== request.rlmMaxDepth) {
              return failure(
                'protocol_error',
                'Prime Agent did not apply the requested RLM max depth.',
              );
            }
          }
          return session;
        }),
      )
      .pipe(
        Effect.catch((error) =>
          invalidateDaemonReadiness.pipe(
            Effect.andThen(
              Effect.sync(() => {
                const importing = request.type === 'saved';
                reportOperationalFailure(
                  controlClient.state() === 'ready'
                    ? importing
                      ? 'Prime Agent session import failed.'
                      : 'Prime Agent session creation failed.'
                    : 'Prime Agent connection failed.',
                  error,
                );
                return controlClient.state() === 'ready'
                  ? failure(
                      'request_failed',
                      importing
                        ? 'Prime Agent could not import the saved Agent.'
                        : 'Prime Agent could not create the Agent.',
                    )
                  : failure(
                      'daemon_unavailable',
                      'Ernie could not start the Prime Agent daemon.',
                    );
              }),
            ),
          ),
        ),
      );
  }

  const createSession = Effect.fn('PrimeAgentDaemon.createSession')(
    (creation: JsonValue) => {
      const parsedCreation = parseSessionCreation(creation);
      if (!parsedCreation.ok) return Effect.succeed(parsedCreation);
      return openSession({ type: 'new', ...parsedCreation.value });
    },
  );

  const importSession = Effect.fn('PrimeAgentDaemon.importSession')(
    (sessionPath: JsonValue) => {
      const parsedSessionPath = parseSavedSessionPath(sessionPath);
      if (!parsedSessionPath.ok) return Effect.succeed(parsedSessionPath);
      return openSession({
        type: 'saved',
        sessionPath: parsedSessionPath.value,
      });
    },
  );

  const renameSession = Effect.fn('PrimeAgentDaemon.renameSession')(
    (
      rename: JsonValue,
    ): Effect.Effect<PrimeAgentResult<PrimeAgentSessionRenameReceipt>> => {
      const parsedRename = parseSessionRename(rename);
      if (!parsedRename.ok) return Effect.succeed(parsedRename);

      return withClient((client) =>
        Effect.tryPromise(() =>
          parsedRename.value.kind === 'live'
            ? client.request(
                {
                  type: 'set_session_name',
                  activeSessionId: parsedRename.value.activeSessionId,
                  name: parsedRename.value.name,
                },
                requestTimeoutMs,
              )
            : client.request(
                {
                  type: 'rename_saved_session',
                  sessionPath: parsedRename.value.sessionPath,
                  name: parsedRename.value.name,
                },
                requestTimeoutMs,
              ),
        ).pipe(
          Effect.map(responseData),
          Effect.map((response) =>
            response.ok
              ? {
                  ok: true as const,
                  value: { name: parsedRename.value.name },
                }
              : response,
          ),
        ),
      );
    },
  );

  const setModel = Effect.fn('PrimeAgentDaemon.setModel')(
    (selection: JsonValue) => {
      const parsedSelection = parseModelSelection(selection);
      if (!parsedSelection.ok) return Effect.succeed(parsedSelection);

      return withClient((client) =>
        Effect.tryPromise(() =>
          client.request(
            {
              type: 'set_model',
              activeSessionId: parsedSelection.value.activeSessionId,
              provider: parsedSelection.value.provider,
              modelId: parsedSelection.value.modelId,
            },
            requestTimeoutMs,
          ),
        ).pipe(
          Effect.map(responseData),
          Effect.map((response) =>
            response.ok ? parseModelData(response.value) : response,
          ),
        ),
      );
    },
  );

  const getRlmDepth = Effect.fn('PrimeAgentDaemon.getRlmDepth')(
    (activeSessionId: JsonValue) => {
      const parsedSessionId = parseActiveSessionId(activeSessionId);
      if (!parsedSessionId.ok) return Effect.succeed(parsedSessionId);

      return withClient((client) =>
        Effect.tryPromise(() =>
          client.request(
            {
              type: 'get_rlm_max_depth_status',
              activeSessionId: parsedSessionId.value,
            },
            requestTimeoutMs,
          ),
        ).pipe(
          Effect.map(responseData),
          Effect.map((response) =>
            response.ok ? parseRlmDepthData(response.value) : response,
          ),
        ),
      );
    },
  );

  const setRlmDepth = Effect.fn('PrimeAgentDaemon.setRlmDepth')(
    (selection: JsonValue) => {
      const parsedSelection = parseRlmDepthSelection(selection);
      if (!parsedSelection.ok) return Effect.succeed(parsedSelection);

      return withClient((client) =>
        Effect.tryPromise(() =>
          client.request(
            {
              type: 'set_rlm_max_depth',
              activeSessionId: parsedSelection.value.activeSessionId,
              maxDepth: parsedSelection.value.maxDepth,
            },
            requestTimeoutMs,
          ),
        ).pipe(
          Effect.map(responseData),
          Effect.map((response) =>
            response.ok ? parseRlmDepthData(response.value) : response,
          ),
        ),
      );
    },
  );

  const submitTask = Effect.fn('PrimeAgentDaemon.submitTask')(
    (submission: JsonValue) => {
      const parsedSubmission = parseTaskSubmission(submission);
      if (!parsedSubmission.ok) return Effect.succeed(parsedSubmission);

      return withClient((client) =>
        Effect.tryPromise(() =>
          client.request(
            {
              type: 'prompt',
              activeSessionId: parsedSubmission.value.activeSessionId,
              message: parsedSubmission.value.message,
              queueIfBusy: true,
              source: 'interactive',
            },
            requestTimeoutMs,
          ),
        ).pipe(
          Effect.map(responseData),
          Effect.map((response) =>
            response.ok
              ? { ok: true as const, value: { accepted: true as const } }
              : response,
          ),
        ),
      );
    },
  );

  const refineSession = Effect.fn('PrimeAgentDaemon.refineSession')(
    (request: JsonValue) => {
      const parsedRequest = parseRefinementRequest(request);
      if (!parsedRequest.ok) return Effect.succeed(parsedRequest);

      return withClient((client) => {
        const command: DaemonCommand =
          parsedRequest.value.instructions === null
            ? {
                type: 'refine',
                activeSessionId: parsedRequest.value.activeSessionId,
              }
            : {
                type: 'refine',
                activeSessionId: parsedRequest.value.activeSessionId,
                instructions: parsedRequest.value.instructions,
              };
        return Effect.tryPromise(() =>
          client.request(command, refinementRequestTimeoutMs),
        ).pipe(
          Effect.map(responseData),
          Effect.map((response) =>
            response.ok
              ? { ok: true as const, value: { refined: true as const } }
              : response,
          ),
        );
      });
    },
  );

  return {
    listWorkspace,
    listModels,
    listSkills,
    sessionFeed,
    listSavedSessions,
    createSession,
    importSession,
    renameSession,
    setModel,
    getRlmDepth,
    setRlmDepth,
    submitTask,
    refineSession,
    workspaceFeed,
    close(): void {
      controlClient.close();
    },
  };
}
