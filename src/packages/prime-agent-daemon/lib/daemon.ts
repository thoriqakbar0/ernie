import type {
  DaemonClient,
  DaemonResponse,
} from 'prime-agent' with { 'resolution-mode': 'import' };
import { Effect } from 'effect';

import type {
  PrimeAgentDaemon,
  PrimeAgentFailureCode,
  PrimeAgentResult,
} from '../types';
import {
  parseActiveSessionId,
  parseModelCatalogData,
  parseModelData,
  parseModelSelection,
  parseRlmDepthData,
  parseRlmDepthSelection,
  parseSessionListData,
  parseTaskSubmission,
} from './protocol';

const connectTimeoutMs = 3_000;
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

function withClient<T>(
  operation: (
    client: DaemonClient,
  ) => Effect.Effect<PrimeAgentResult<T>, unknown>,
): Effect.Effect<PrimeAgentResult<T>> {
  let connected = false;
  return Effect.tryPromise(() => import('prime-agent')).pipe(
    Effect.map(
      ({ DaemonClient: DaemonClientConstructor, defaultDaemonSocketPath }) =>
        new DaemonClientConstructor(defaultDaemonSocketPath()),
    ),
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
              'The Prime Agent daemon is not available.',
            );
      }),
    ),
  );
}

/** Create the Prime Agent daemon adapter owned by Electron's main process. */
export function createPrimeAgentDaemon(currentCwd: string): PrimeAgentDaemon {
  const normalizedCwd = currentCwd.trim();
  if (normalizedCwd.length === 0) {
    throw new Error('The current workspace path must not be empty.');
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
    setModel,
    getRlmDepth,
    setRlmDepth,
    submitTask,
  };
}
