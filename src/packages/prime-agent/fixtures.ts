import type {
  PrimeSessionMessage,
  PrimeSessionSummary,
  PrimeUsefulSessionContext,
} from "./index"

export function createPrimeUsefulSessionFixture(
  session: Pick<PrimeSessionSummary, "cwd" | "id" | "model" | "name" | "state">,
  messages: readonly PrimeSessionMessage[] = [],
): PrimeUsefulSessionContext {
  const working = session.state === "working"
  return {
    state: {
      activeSessionId: session.id,
      sessionId: session.id,
      cwd: session.cwd,
      ...(session.name ? { sessionName: session.name } : {}),
      leafId: null,
      ...(session.model ? { model: session.model } : {}),
      thinkingLevel: "off",
      serviceTier: "auto",
      availableThinkingLevels: ["off"],
      isStreaming: working,
      isCompacting: false,
      isBashRunning: false,
      retryAttempt: 0,
      steeringMode: "all",
      followUpMode: "all",
      autoCompactionEnabled: true,
      messageCount: messages.length,
      sessionActions: { queuedCount: 0, steering: [], followUps: [] },
      compactionCount: 0,
      goal: {
        active: false,
        status: "idle",
        tokensUsed: 0,
        timeUsedSeconds: 0,
        continuationsUsed: 0,
      },
      scopedModels: [],
      activeToolNames: [],
      contextUsage: { tokens: 0, contextWindow: 0, percent: 0 },
    },
    structuredMessages: messages.map((message) => ({ ...message })),
    children: [],
  }
}
