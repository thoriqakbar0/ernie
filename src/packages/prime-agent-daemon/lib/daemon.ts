import type {
  DaemonClient,
  DaemonCommand,
  DaemonResponse,
} from 'prime-agent' with { 'resolution-mode': 'import' };
import { readFile } from 'node:fs/promises';
import { Effect, Predicate, Schedule } from 'effect';
import { parseJsonValue, type JsonValue } from '../../json-value';

import type {
  PrimeAgentDaemon,
  PrimeAgentDaemonConfiguration,
  PrimeAgentFailureCode,
  PrimeAgentResult,
  PrimeAgentSession,
  PrimeAgentSessionRenameReceipt,
} from '../types';
import { startPrimeAgentDaemonProcess } from './daemon-process';
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
  parseSessionViewData,
  parseSkillResourceCatalogData,
  parseTaskSubmission,
} from './protocol';

const connectTimeoutMs = 3_000;
const daemonProbeTimeoutMs = 250;
const daemonStartupAttempts = 400;
const requestTimeoutMs = 10_000;
const refinementRequestTimeoutMs = 10 * 60 * 1_000;

function failure(
  code: PrimeAgentFailureCode,
  message: string,
): PrimeAgentResult<never> {
  return { ok: false, error: { code, message } };
}

function responseData(response: DaemonResponse): PrimeAgentResult<JsonValue> {
  if (!response.success) {
    return failure('request_failed', 'Prime Agent could not complete the request.');
  }
  const value = parseJsonValue(response.data);
  return value === null && response.data !== null
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
  const retainedSessionClients = new Map<string, DaemonClient>();

  const loadRuntime = Effect.tryPromise(() => import('prime-agent')).pipe(
    Effect.map(
      ({ DaemonClient: DaemonClientConstructor, defaultDaemonSocketPath }) => {
        const socketPath =
          configuration.socketPath ?? defaultDaemonSocketPath();
        return {
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
        Effect.catchAll(() =>
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

  function withClient<T>(
    operation: (
      client: DaemonClient,
    ) => Effect.Effect<PrimeAgentResult<T>, unknown>,
  ): Effect.Effect<PrimeAgentResult<T>> {
    let connected = false;
    return ensureDaemonReady.pipe(
      Effect.andThen(loadRuntime),
      Effect.map((runtime) => runtime.createClient()),
      Effect.flatMap((client) =>
        Effect.acquireUseRelease(
          Effect.succeed(client),
          (activeClient) =>
            Effect.gen(function* () {
              yield* Effect.tryPromise(() =>
                activeClient.connect(connectTimeoutMs),
              );
              connected = true;
              return yield* operation(activeClient);
            }),
          (activeClient) => Effect.sync(() => activeClient.close()),
        ),
      ),
      Effect.catchAll((error) =>
        invalidateDaemonReadiness.pipe(
          Effect.andThen(
            Effect.sync(() => {
              reportOperationalFailure(
                connected
                  ? 'Prime Agent request failed.'
                  : 'Prime Agent connection failed.',
                error,
              );
              return connected
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

          const skills = yield* Effect.forEach(
            catalog.value,
            (skill) =>
              Effect.tryPromise(() => readFile(skill.filePath, 'utf8')).pipe(
                Effect.catchAll((cause) =>
                  Effect.sync(() => {
                    reportOperationalFailure(
                      'Prime Agent skill file could not be read.',
                      cause,
                    );
                    return '';
                  }),
                ),
                Effect.map((content) => ({
                  command: `/skill:${skill.name}`,
                  content,
                  description: skill.description,
                  name: skill.name,
                })),
              ),
            { concurrency: 8 },
          );
          return { ok: true, value: skills } as const;
        }),
      );
    },
  );

  const getSessionView = Effect.fn('PrimeAgentDaemon.getSessionView')(
    (activeSessionId: JsonValue) => {
      const parsedSessionId = parseActiveSessionId(activeSessionId);
      if (!parsedSessionId.ok) return Effect.succeed(parsedSessionId);

      return withClient((client) =>
        Effect.gen(function* () {
          const viewResponse = responseData(
            yield* Effect.tryPromise(() =>
              client.request(
                { type: 'attach', activeSessionId: parsedSessionId.value },
                requestTimeoutMs,
              ),
            ),
          );
          if (!viewResponse.ok) return viewResponse;

          const depthResponse = responseData(
            yield* Effect.tryPromise(() =>
              client.request(
                {
                  type: 'get_rlm_max_depth_status',
                  activeSessionId: parsedSessionId.value,
                },
                requestTimeoutMs,
              ),
            ),
          );
          if (!depthResponse.ok) return depthResponse;

          return parseSessionViewData(viewResponse.value, depthResponse.value);
        }),
      );
    },
  );

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
    let connected = false;
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

    return ensureDaemonReady.pipe(
      Effect.andThen(loadRuntime),
      Effect.map((runtime) => runtime.createClient()),
      Effect.flatMap((client) => {
        let retained = false;
        return Effect.acquireUseRelease(
          Effect.succeed(client),
          (activeClient) =>
            Effect.gen(function* () {
              yield* Effect.tryPromise(() =>
                activeClient.connect(connectTimeoutMs),
              );
              connected = true;

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

              const rawAttachResponse = yield* Effect.tryPromise(() =>
                activeClient.request(
                  {
                    type: 'attach',
                    activeSessionId: session.value.activeSessionId,
                  },
                  requestTimeoutMs,
                ),
              );
              const attachResponse = responseData(rawAttachResponse);
              if (!attachResponse.ok) return attachResponse;

              const previousClient = retainedSessionClients.get(
                session.value.activeSessionId,
              );
              previousClient?.close();
              retainedSessionClients.set(
                session.value.activeSessionId,
                activeClient,
              );
              retained = true;
              return session;
            }),
          (activeClient) =>
            Effect.sync(() => {
              if (!retained) activeClient.close();
            }),
        );
      }),
      Effect.catchAll((error) =>
        invalidateDaemonReadiness.pipe(
          Effect.andThen(
            Effect.sync(() => {
              const importing = request.type === 'saved';
              reportOperationalFailure(
                connected
                  ? importing
                    ? 'Prime Agent session import failed.'
                    : 'Prime Agent session creation failed.'
                  : 'Prime Agent connection failed.',
                error,
              );
              return connected
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
    getSessionView,
    listSavedSessions,
    createSession,
    importSession,
    renameSession,
    setModel,
    getRlmDepth,
    setRlmDepth,
    submitTask,
    refineSession,
    close(): void {
      for (const client of retainedSessionClients.values()) client.close();
      retainedSessionClients.clear();
    },
  };
}
