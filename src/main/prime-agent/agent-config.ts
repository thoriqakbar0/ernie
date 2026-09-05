import type { AgentSessionRuntimeConfig } from "prime-agent"
import type { ConversationOrigin } from "../../packages/agents"

/** Supplies the immutable origin through native configuration; resume retains the session's accepted model. */
export function nativeConversationConfig(origin: ConversationOrigin, resume = false): AgentSessionRuntimeConfig {
  return {
    cwd: origin.cwd,
    appendSystemPrompt: origin.instructions ? [origin.instructions] : [],
    ...(!resume && origin.model ? { provider: origin.provider, model: origin.model } : {}),
  }
}
