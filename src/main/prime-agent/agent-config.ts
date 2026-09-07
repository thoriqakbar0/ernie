import type { AgentSessionRuntimeConfig } from "prime-agent"
import type { ConversationOrigin } from "../../packages/agents"

/** Supplies the immutable origin through native configuration; resume retains the session's accepted model. */
export const nativeConversationConfig = function nativeConversationConfig(
  origin: ConversationOrigin,
  resume = false,
): AgentSessionRuntimeConfig {
  return {
    appendSystemPrompt: origin.instructions ? [origin.instructions] : [],
    cwd: origin.cwd,
    ...(!resume && origin.model ? { model: origin.model, provider: origin.provider } : {}),
  }
}
