import { Random } from "effect"

/** Curated first names for Agent suggestions; names are not unique identifiers. */
const agentFirstNames = [
  "Ernie", "Milo", "Ollie", "Theo", "Pip",
  "Cleo", "Remy", "Winnie", "Mabel", "Toby",
] as const

/** Chooses a name when executed, using Effect's active Random service. */
export const randomAgentFirstName = Random.choice(agentFirstNames)
