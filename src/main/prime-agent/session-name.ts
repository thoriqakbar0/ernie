import type { PrimeSessionSummary } from "../../packages/prime-agent"

/** Chooses the first readable resident-agent name that Prime Agent does not use. */
export function chooseAvailableSessionName(
  requested: string | undefined,
  sessions: readonly PrimeSessionSummary[],
  rejectedNames: ReadonlySet<string> = new Set(),
) {
  const base = requested?.trim()
  if (!base) return undefined

  const names = new Set(sessions.flatMap(({ name }) => name ? [name] : []))
  if (!names.has(base) && !rejectedNames.has(base)) return base

  for (let suffix = 2; suffix < Number.MAX_SAFE_INTEGER; suffix += 1) {
    const candidate = `${base} ${suffix}`
    if (!names.has(candidate) && !rejectedNames.has(candidate)) return candidate
  }
  throw new Error("Prime Agent session names are exhausted")
}

/** Identifies Prime Agent's stable duplicate-name failure for one requested name. */
export function isUnavailableSessionNameError(error: unknown, name: string) {
  return error instanceof Error && error.message.startsWith(
    `Agent name ${JSON.stringify(name)} is unavailable:`,
  )
}
