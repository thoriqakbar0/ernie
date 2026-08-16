import type { PrimeAgentRendererClient } from '@/packages/agent-renderer-client';

const unusedResult = {
  ok: false,
  error: { code: 'request_failed', message: 'Unused test operation.' },
} as const;

/** Build a typed renderer client with explicit overrides for tested operations. */
export function createPrimeAgentRendererClientFixture(
  overrides: Partial<PrimeAgentRendererClient> = {},
): PrimeAgentRendererClient {
  return {
    watchWorkspace: () => ({ id: 'test-workspace', close: () => undefined }),
    watchSession: () => ({ id: 'test-session', close: () => undefined }),
    createSession: async () => unusedResult,
    listSavedSessions: async () => unusedResult,
    importSession: async () => unusedResult,
    renameSession: async () => unusedResult,
    listModels: async () => unusedResult,
    getConfiguration: async () => unusedResult,
    listSkills: async () => unusedResult,
    loadHistory: async () => unusedResult,
    setModel: async () => unusedResult,
    setThinkingLevel: async () => unusedResult,
    getRlmDepth: async () => unusedResult,
    setRlmDepth: async () => unusedResult,
    submitTask: async () => unusedResult,
    refineSession: async () => unusedResult,
    ...overrides,
  };
}
