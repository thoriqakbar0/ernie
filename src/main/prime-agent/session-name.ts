import { Effect, Schedule } from "effect"
import { availableAgentName } from "../../packages/agents/names"
import type { PrimeSessionSummary } from "../../packages/prime-agent"

const GENERIC_SESSION_NAME = /^(?:New Prime Agent session|Untitled conversation)(?: \d+)?$/iu
const LEADING_REQUEST_WORDS =
  /^(?:(?:please|kindly)\s+|(?:can|could|would)\s+you\s+|i\s+(?:need|want)\s+you\s+to\s+|help\s+me\s+(?:to\s+)?)/iu
const MAX_SESSION_NAME_WORDS = 8
const MAX_SESSION_NAME_LENGTH = 64

/** Chooses the first readable resident-agent name that Prime Agent does not use. */
export const chooseAvailableSessionName = (
  requested: string | undefined,
  sessions: readonly PrimeSessionSummary[],
  rejectedNames: ReadonlySet<string> = new Set(),
) => {
  const base = requested?.trim()
  if (!base) {
    return
  }

  const names = new Set(sessions.flatMap(({ name }) => (name ? [name] : [])))
  return availableAgentName(base, new Set([...names, ...rejectedNames]))
}

/** Identifies Prime Agent's stable duplicate-name failure for one requested name. */
export const isUnavailableSessionNameError = (error: unknown, name: string) =>
  error instanceof Error &&
  error.message.startsWith(`Agent name ${JSON.stringify(name)} is unavailable:`)

/** Retries only explicit name rejection, never an uncertain or successful admission. */
export const createWithAvailableSessionName = <A>(
  requested: string | undefined,
  sessions: readonly PrimeSessionSummary[],
  create: (name: string | undefined) => Promise<A>,
) =>
  Effect.gen(function* allocateSessionName() {
    const rejected = new Set<string>()
    const attempt = Effect.suspend(() => {
      const name = chooseAvailableSessionName(requested, sessions, rejected)
      return Effect.tryPromise({
        catch: (cause) => {
          if (name && isUnavailableSessionNameError(cause, name)) {
            rejected.add(name)
            return { _tag: "SessionNameConflict" as const, cause }
          }
          return { _tag: "SessionAdmissionFailure" as const, cause }
        },
        try: () => create(name),
      })
    })
    return yield* attempt.pipe(
      Effect.retry({
        schedule: Schedule.recurs(32),
        while: (error) => error._tag === "SessionNameConflict",
      }),
      Effect.mapError((error) => error.cause),
    )
  })

/** Reports whether Ernie may replace a session name without overwriting user intent. */
export const isGenericSessionName = (name: string | undefined) =>
  name === undefined || GENERIC_SESSION_NAME.test(name.trim())

/** Derives one concise display name from the first non-empty user prompt. */
export const deriveSessionName = (prompt: string) => {
  const meaningfulLine = prompt
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/^(?:#{1,6}|[-*+])\s+/u, ""))
    .find((line) => line.length > 0 && !/^<\/?[\w-]+(?:\s[^>]*)?>$/u.test(line))

  if (!meaningfulLine) {
    return
  }

  const withoutRequestWords = meaningfulLine.replace(LEADING_REQUEST_WORDS, "").trim()
  const words = withoutRequestWords.split(/\s+/u).filter(Boolean)
  if (words.length === 0) {
    return
  }

  const selected: string[] = []
  for (const word of words.slice(0, MAX_SESSION_NAME_WORDS)) {
    selected.push(word)
    if (/[.!?]$/u.test(word)) {
      break
    }
  }
  const firstSentence = selected.join(" ").replace(/[\s:;,.!?]+$/u, "")

  const bounded =
    firstSentence.length <= MAX_SESSION_NAME_LENGTH
      ? firstSentence
      : `${firstSentence.slice(0, MAX_SESSION_NAME_LENGTH - 1).trimEnd()}…`
  return bounded.replace(/^\p{Ll}/u, (letter) => letter.toUpperCase()) || undefined
}
