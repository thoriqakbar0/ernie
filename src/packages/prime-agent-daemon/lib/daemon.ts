import type {
  DaemonClient,
  DaemonResponse,
} from 'prime-agent' with { 'resolution-mode': 'import' };

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

async function withClient<T>(
  operation: (client: DaemonClient) => Promise<PrimeAgentResult<T>>,
): Promise<PrimeAgentResult<T>> {
  let client: DaemonClient | null = null;
  let connected = false;
  try {
    const { DaemonClient: DaemonClientConstructor, defaultDaemonSocketPath } =
      await import('prime-agent');
    client = new DaemonClientConstructor(defaultDaemonSocketPath());
    await client.connect(connectTimeoutMs);
    connected = true;
    return await operation(client);
  } catch (error) {
    reportOperationalFailure(
      connected ? 'Prime Agent request failed.' : 'Prime Agent connection failed.',
      error,
    );
    return connected
      ? failure('request_failed', 'Prime Agent could not complete the request.')
      : failure(
          'daemon_unavailable',
          'The Prime Agent daemon is not available.',
        );
  } finally {
    client?.close();
  }
}

/** Create the Prime Agent daemon adapter owned by Electron's main process. */
export function createPrimeAgentDaemon(currentCwd: string): PrimeAgentDaemon {
  const normalizedCwd = currentCwd.trim();
  if (normalizedCwd.length === 0) {
    throw new Error('The current workspace path must not be empty.');
  }

  return {
    listWorkspace: () =>
      withClient(async (client) => {
        const response = responseData(
          await client.request({ type: 'list' }, requestTimeoutMs),
        );
        if (!response.ok) return response;

        const sessions = parseSessionListData(response.value);
        if (!sessions.ok) return sessions;

        const ordered = [...sessions.value].sort((left, right) => {
          const leftLocal = left.cwd === normalizedCwd ? 1 : 0;
          const rightLocal = right.cwd === normalizedCwd ? 1 : 0;
          if (leftLocal !== rightLocal) return rightLocal - leftLocal;
          return (right.modifiedAt ?? '').localeCompare(left.modifiedAt ?? '');
        });

        return {
          ok: true,
          value: { currentCwd: normalizedCwd, sessions: ordered },
        };
      }),
    listModels: (activeSessionId) => {
      const parsedSessionId = parseActiveSessionId(activeSessionId);
      if (!parsedSessionId.ok) return Promise.resolve(parsedSessionId);

      return withClient(async (client) => {
        const response = responseData(
          await client.request(
            {
              type: 'get_model_catalog',
              activeSessionId: parsedSessionId.value,
            },
            requestTimeoutMs,
          ),
        );
        return response.ok ? parseModelCatalogData(response.value) : response;
      });
    },
    setModel: (selection) => {
      const parsedSelection = parseModelSelection(selection);
      if (!parsedSelection.ok) return Promise.resolve(parsedSelection);

      return withClient(async (client) => {
        const response = responseData(
          await client.request(
            {
              type: 'set_model',
              activeSessionId: parsedSelection.value.activeSessionId,
              provider: parsedSelection.value.provider,
              modelId: parsedSelection.value.modelId,
            },
            requestTimeoutMs,
          ),
        );
        return response.ok ? parseModelData(response.value) : response;
      });
    },
    getRlmDepth: (activeSessionId) => {
      const parsedSessionId = parseActiveSessionId(activeSessionId);
      if (!parsedSessionId.ok) return Promise.resolve(parsedSessionId);

      return withClient(async (client) => {
        const response = responseData(
          await client.request(
            {
              type: 'get_rlm_max_depth_status',
              activeSessionId: parsedSessionId.value,
            },
            requestTimeoutMs,
          ),
        );
        return response.ok ? parseRlmDepthData(response.value) : response;
      });
    },
    setRlmDepth: (selection) => {
      const parsedSelection = parseRlmDepthSelection(selection);
      if (!parsedSelection.ok) return Promise.resolve(parsedSelection);

      return withClient(async (client) => {
        const response = responseData(
          await client.request(
            {
              type: 'set_rlm_max_depth',
              activeSessionId: parsedSelection.value.activeSessionId,
              maxDepth: parsedSelection.value.maxDepth,
            },
            requestTimeoutMs,
          ),
        );
        return response.ok ? parseRlmDepthData(response.value) : response;
      });
    },
  };
}
