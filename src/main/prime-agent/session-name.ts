import type { PrimeSessionSummary } from "../../packages/prime-agent"

const GENERIC_SESSION_NAME = /^(?:New Prime Agent session|Untitled conversation)(?: \d+)?$/i
const LEADING_REQUEST_WORDS = /^(?:(?:please|kindly)\s+|(?:can|could|would)\s+you\s+|i\s+(?:need|want)\s+you\s+to\s+|help\s+me\s+(?:to\s+)?)/i
const MAX_SESSION_NAME_WORDS = 8
const MAX_SESSION_NAME_LENGTH = 64

/** Chooses the first readable resident-agent name that Prime Agent does not use. */
export function chooseAvailableSessionName(
  requested: string | undefined,
  sessions: readonly PrimeSessionSummary[],
) {
  const base = requested?.trim()
  if (!base) return undefined

  const names = new Set(sessions.flatMap(({ name }) => name ? [name] : []))
  if (!names.has(base)) return base

  for (let suffix = 2; suffix < Number.MAX_SAFE_INTEGER; suffix += 1) {
    const candidate = `${base} ${suffix}`
    if (!names.has(candidate)) return candidate
  }
  throw new Error("Prime Agent session names are exhausted")
}

/** Reports whether Ernie may replace a session name without overwriting user intent. */
export function isGenericSessionName(name: string | undefined) {
  return name === undefined || GENERIC_SESSION_NAME.test(name.trim())
}

/** Derives one concise display name from the first non-empty user prompt. */
export function deriveSessionName(prompt: string) {
  const meaningfulLine = prompt
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:#{1,6}|[-*+])\s+/, ""))
    .find((line) => line.length > 0 && !/^<\/?[\w-]+(?:\s[^>]*)?>$/.test(line))

  if (!meaningfulLine) return undefined

  const withoutRequestWords = meaningfulLine.replace(LEADING_REQUEST_WORDS, "").trim()
  const words = withoutRequestWords.split(/\s+/).filter(Boolean)
  if (words.length === 0) return undefined

  const firstSentence = words
    .slice(0, MAX_SESSION_NAME_WORDS)
    .reduce<string[]>((selected, word) => {
      if (selected.some((entry) => /[.!?]$/.test(entry))) return selected
      selected.push(word)
      return selected
    }, [])
    .join(" ")
    .replace(/[\s:;,.!?]+$/, "")

  const bounded = firstSentence.length <= MAX_SESSION_NAME_LENGTH
    ? firstSentence
    : `${firstSentence.slice(0, MAX_SESSION_NAME_LENGTH - 1).trimEnd()}…`
  return bounded.replace(/^\p{Ll}/u, (letter) => letter.toUpperCase()) || undefined
}
