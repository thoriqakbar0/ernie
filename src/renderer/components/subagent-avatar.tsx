import { AgentAvatar } from "./agent-avatar"

/** Reuses the sidebar's stable child character recipe across participant surfaces. */
export const SubagentAvatar = ({
  childId,
  size = "small",
  working = false,
}: {
  childId: string
  size?: "small" | "default"
  working?: boolean
}) => {
  let seed = 2_166_136_261
  for (const character of childId) {
    // oxlint-disable-next-line no-bitwise, unicorn/prefer-code-point -- Preserve the existing sidebar character recipe.
    seed = Math.imul(seed ^ character.charCodeAt(0), 16_777_619) >>> 0
  }
  return <AgentAvatar avatar={{ kind: "generated", seed }} size={size} working={working} />
}
