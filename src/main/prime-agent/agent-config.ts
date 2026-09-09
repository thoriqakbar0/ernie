import path from "node:path"
import { existsSync } from "node:fs"
import type { AgentSessionRuntimeConfig } from "prime-agent"
import type { ConversationOrigin } from "../../packages/agents"

/** Supplies the immutable origin through native configuration; resume retains the session's accepted model. */
export const nativeConversationConfig = function nativeConversationConfig(
  origin: ConversationOrigin,
  resume = false,
): AgentSessionRuntimeConfig {
  const source = process.env.ERNIE_MANAGED_SOURCE ?? process.cwd()
  const skill = path.join(source, ".agents", "skills", "ernie-skill", "SKILL.md")
  const available = existsSync(skill)
  return {
    appendSystemPrompt: [
      ...(origin.instructions ? [origin.instructions] : []),
      ...(available
        ? [
            `You are running in Ernie, a malleable interface you can adapt when the user asks. The ernie-skill at ${skill} explains how to change the interface.`,
          ]
        : []),
    ],
    ...(available
      ? {
          skills: [
            skill,
            path.join(source, ".agents", "skills", "iterate-ernie", "SKILL.md"),
          ].filter((file) => existsSync(file)),
        }
      : {}),
    cwd: origin.cwd,
    ...(!resume && origin.thinkingLevel ? { thinking: origin.thinkingLevel } : {}),
    ...(!resume && origin.model ? { model: origin.model, provider: origin.provider } : {}),
  }
}
