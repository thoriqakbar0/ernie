import type {
  PrimeSessionChange,
  PrimeSessionMessage,
  PrimeSessionSnapshot,
  PrimeSessionSummary,
} from "../../packages/prime-agent"
import { Option, Schema } from "effect"

const recordSchema = Schema.Record(Schema.String, Schema.Unknown)

/** Projects an unknown Prime Agent connection snapshot into Ernie's JSON contract. */
export function projectPrimeSessionSnapshot(
  input: unknown,
  previousSession?: PrimeSessionSummary,
): PrimeSessionSnapshot {
  const snapshot = readRecord(input, "connection snapshot")
  const state = readRecord(snapshot.state, "connection state")
  const sessionId = readString(state.activeSessionId) ?? previousSession?.id
  const cwd = readString(state.cwd) ?? previousSession?.cwd
  if (!sessionId || !cwd) {
    throw new Error("Prime Agent returned a session snapshot without an identity or working directory")
  }

  const values = Array.isArray(snapshot.messages) ? [...snapshot.messages] : []
  if (snapshot.streamingMessage !== undefined) values.push(snapshot.streamingMessage)
  const messages = values.flatMap((value, index) =>
    toSessionMessage(value, sessionId, index)
  )
  const lifecycle = previousSession?.lifecycle === "draft" && messages.some(({ role }) => role === "user")
    ? "live"
    : previousSession?.lifecycle ?? "live"

  return {
    session: {
      id: sessionId,
      cwd,
      name: readString(state.sessionName) ?? previousSession?.name,
      lifecycle,
      state: readSessionState(state),
      model: readModel(state.model) ?? previousSession?.model,
    },
    messages,
    transport: { status: "connected" },
  }
}

/** Computes the smallest ordered JSON changes between two projected snapshots. */
export function diffPrimeSessionSnapshots(
  previous: PrimeSessionSnapshot,
  next: PrimeSessionSnapshot,
): readonly PrimeSessionChange[] {
  const changes: PrimeSessionChange[] = []
  if (!sameJson(previous.session, next.session)) {
    changes.push({ type: "session", session: next.session })
  }

  if (!hasStableMessageOrder(previous.messages, next.messages)) {
    changes.push({ type: "messages", messages: next.messages })
  } else {
    for (const [index, message] of next.messages.entries()) {
      if (!sameJson(previous.messages[index], message)) {
        changes.push({ type: "message", message })
      }
    }
  }

  if (!sameJson(previous.transport, next.transport)) {
    changes.push({ type: "transport", transport: next.transport })
  }
  return changes
}

function readSessionState(
  state: Record<string, unknown>,
): PrimeSessionSummary["state"] {
  if (state.workerState === "recovering") return "recovering"
  return state.isStreaming === true || state.isCompacting === true || state.isBashRunning === true
    ? "working"
    : "idle"
}

function readModel(value: unknown) {
  const model = asRecord(value)
  const id = readString(model?.id)
  const provider = readString(model?.provider)
  if (!id || !provider) return undefined
  return { id, provider, label: readString(model?.name) ?? id }
}

function toSessionMessage(
  value: unknown,
  sessionId: string,
  index: number,
): PrimeSessionMessage[] {
  const message = asRecord(value)
  if (!message) return []
  const role = message.role
  if (role !== "assistant" && role !== "system" && role !== "user") return []
  const content = readMessageContent(message.content)
  if (!content) return []
  const timestamp = typeof message.timestamp === "number" ? message.timestamp : "unknown"
  return [{
    id: readString(message.id) ?? `${sessionId}:${role}:${timestamp}:${index}`,
    role,
    content,
  }]
}

function readMessageContent(value: unknown): string {
  if (typeof value === "string") return value
  if (!Array.isArray(value)) return ""
  return value.flatMap((part) => {
    const record = asRecord(part)
    return record?.type === "text" && typeof record.text === "string" ? [record.text] : []
  }).join("")
}

function hasStableMessageOrder(
  previous: readonly PrimeSessionMessage[],
  next: readonly PrimeSessionMessage[],
) {
  if (next.length < previous.length) return false
  return previous.every((message, index) => next[index]?.id === message.id)
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function readRecord(value: unknown, label: string) {
  const record = asRecord(value)
  if (!record) throw new Error(`Prime Agent returned an invalid ${label}`)
  return record
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return Option.getOrUndefined(Schema.decodeUnknownOption(recordSchema)(value))
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}
