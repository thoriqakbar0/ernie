import { Random } from "effect"

/** Curated first names for Agent suggestions; names are not unique identifiers. */
const agentFirstNames = [
  "Ernie",
  "Milo",
  "Ollie",
  "Theo",
  "Pip",
  "Cleo",
  "Remy",
  "Winnie",
  "Mabel",
  "Toby",
] as const

/** Chooses a name when executed, using Effect's active Random service. */
export const randomAgentFirstName = Random.choice(agentFirstNames)

/** Suggest a different name without an unbounded retry loop. */
export const randomAgentNameExcept = (current: string) =>
  Random.choice(agentFirstNames.filter((name) => name !== current))

/** Allocates a display name against known names; native admission still arbitrates races. */
export const availableAgentName = (requested: string, names: ReadonlySet<string>): string => {
  const base = requested.trim()
  if (!names.has(base)) {
    return base
  }
  for (let suffix = 2; suffix < Number.MAX_SAFE_INTEGER; suffix += 1) {
    const candidate = `${base} ${suffix}`
    if (!names.has(candidate)) {
      return candidate
    }
  }
  throw new Error("Agent names are exhausted")
}
