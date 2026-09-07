import type { PrimeSessionMessage, PrimeSessionSummary, PrimeUsefulSessionContext } from "./index"

export const createPrimeUsefulSessionFixture = (
  session: Pick<PrimeSessionSummary, "cwd" | "id" | "model" | "name" | "state">,
  messages: readonly PrimeSessionMessage[] = [],
): PrimeUsefulSessionContext => {
  const working = session.state === "working"
  return {
    children: [],
    state: {
      activeSessionId: session.id,
      cwd: session.cwd,
      sessionId: session.id,
      ...(session.name ? { sessionName: session.name } : {}),
      leafId: null,
      ...(session.model ? { model: session.model } : {}),
      activeToolNames: [],
      autoCompactionEnabled: true,
      availableThinkingLevels: ["off"],
      compactionCount: 0,
      contextUsage: { contextWindow: 0, percent: 0, tokens: 0 },
      followUpMode: "all",
      goal: {
        active: false,
        continuationsUsed: 0,
        status: "idle",
        timeUsedSeconds: 0,
        tokensUsed: 0,
      },
      isBashRunning: false,
      isCompacting: false,
      isStreaming: working,
      messageCount: messages.length,
      retryAttempt: 0,
      scopedModels: [],
      serviceTier: "auto",
      sessionActions: { followUps: [], queuedCount: 0, steering: [] },
      steeringMode: "all",
      thinkingLevel: "off",
    },
    structuredMessages: messages.map((message) => ({ ...message })),
  }
}
