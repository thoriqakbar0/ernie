import type {
  DaemonClient,
  DaemonResponse,
} from 'prime-agent' with { 'resolution-mode': 'import' };
import { Effect, Schedule } from 'effect';

import type {
  PrimeAgentDaemon,
  PrimeAgentDaemonConfiguration,
  PrimeAgentFailureCode,
  PrimeAgentResult,
} from '../types';
import { startPrimeAgentDaemonProcess } from './daemon-process';
import {
  parseActiveSessionId,
  parseCreatedSessionData,
  parseModelCatalogData,
  parseModelData,
  parseModelSelection,
  parseRlmDepthData,
  parseRlmDepthSelection,
  parseSessionListData,
  parseSkillCatalogData,
  parseTaskSubmission,
  parseWorkspaceCwd,
} from './protocol';

const connectTimeoutMs = 3_000;
const daemonProbeTimeoutMs = 250;
const daemonStartupAttempts = 400;
const requestTimeoutMs = 10_000;

function failure(
  code: PrimeAgentFailureCode,
  message: string,
): PrimeAgentResult<never> {
  return { ok: false, error: { code, message } };
}

function responseData(response: DaemonResponse): PrimeAgentResult<unknown> {
  return response.success
    ? { ok: true, value: response.data }
    : failure('request_failed', 'Prime Agent could not complete the request.');
}

function errorMetadata(error: unknown): Readonly<{
  name: string;
  code: string | null;
}> {
  if (!(error instanceof Error)) return { name: 'NonError', code: null };
  const code = 'code' in error && typeof error.code === 'string'
    ? error.code
    : null;
  return { name: error.name, code };
}

function reportOperationalFailure(scope: string, error: unknown): void {
  console.error(scope, errorMetadata(error));
}

interface PrimeAgentDaemonRuntime {
  readonly createClient: () => DaemonClient;
  readonly socketPath: string;
}

/** Create the Prime Agent daemon adapter owned by Electron's main process. */
export function createPrimeAgentDaemon(
  configuration: PrimeAgentDaemonConfiguration,
): PrimeAgentDaemon {
  const normalizedCwd = configuration.currentCwd.trim();
  if (normalizedCwd.length === 0) {
    throw new Error('The current workspace path must not be empty.');
  }
  if (
    configuration.daemonEntrypointPath.trim().length === 0 ||
    configuration.executablePath.trim().length === 0
  ) {
    throw new Error('Prime Agent daemon process paths must not be empty.');
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
    (activeSessionId: unknown) => {
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
    (activeSessionId: unknown) => {
      const parsedSessionId = parseActiveSessionId(activeSessionId);
      if (!parsedSessionId.ok) return Effect.succeed(parsedSessionId);

      return withClient((client) =>
        Effect.tryPromise(() =>
          client.request(
            {
              type: 'get_commands',
              activeSessionId: parsedSessionId.value,
            },
            requestTimeoutMs,
          ),
        ).pipe(
          Effect.map(responseData),
          Effect.map((response) =>
            response.ok ? parseSkillCatalogData(response.value) : response,
          ),
        ),
      );
    },
  );

  const createSession = Effect.fn('PrimeAgentDaemon.createSession')(
    (cwd: unknown) => {
      const parsedCwd = parseWorkspaceCwd(cwd);
      if (!parsedCwd.ok) return Effect.succeed(parsedCwd);

      let connected = false;
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
                  activeClient.request(
                    {
                      type: 'create',
                      config: { cwd: parsedCwd.value },
                      lifecycle: 'resident',
                    },
                    requestTimeoutMs,
                  ),
                );
                const createResponse = responseData(rawCreateResponse);
                if (!createResponse.ok) return createResponse;

                const session = parseCreatedSessionData(createResponse.value);
                if (!session.ok) return session;

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
                reportOperationalFailure(
                  connected
                    ? 'Prime Agent session creation failed.'
                    : 'Prime Agent connection failed.',
                  error,
                );
                return connected
                  ? failure(
                      'request_failed',
                      'Prime Agent could not create the Agent.',
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
    },
  );

  const setModel = Effect.fn('PrimeAgentDaemon.setModel')(
    (selection: unknown) => {
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
    (activeSessionId: unknown) => {
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
    (selection: unknown) => {
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
    (submission: unknown) => {
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

  return {
    listWorkspace,
    listModels,
    listSkills,
    createSession,
    setModel,
    getRlmDepth,
    setRlmDepth,
    submitTask,
    close(): void {
      for (const client of retainedSessionClients.values()) client.close();
      retainedSessionClients.clear();
    },
  };
}
