import { Option, Schema } from "effect"

import type {
  PrimeSessionChange,
  PrimeSessionChangeEnvelope,
  PrimeSessionSnapshot,
  PrimeSessionSnapshotEnvelope,
} from "./index"

const strictParseOptions = { onExcessProperty: "error" } as const

const modelSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  provider: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
})

const sessionSummarySchema = Schema.Struct({
  id: Schema.NonEmptyString,
  cwd: Schema.NonEmptyString,
  name: Schema.optionalKey(Schema.NonEmptyString),
  lifecycle: Schema.Literals(["archived", "draft", "live"]),
  state: Schema.Literals(["idle", "working", "recovering"]),
  model: Schema.optionalKey(modelSchema),
})

const sessionMessageSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  role: Schema.Literals(["assistant", "system", "user"]),
  content: Schema.String,
})

const sessionMessagesSchema = Schema.Array(sessionMessageSchema).check(
  Schema.makeFilter((messages) => {
    const ids = new Set<string>()
    const issues: Schema.FilterIssue[] = []
    for (const [index, message] of messages.entries()) {
      if (!ids.has(message.id)) {
        ids.add(message.id)
        continue
      }
      issues.push({
        issue: "message ids must be unique",
        path: [index, "id"],
      })
    }
    return issues
  }),
)

const transportSchema = Schema.Union(
  [
    Schema.Struct({ status: Schema.Literal("connected") }),
    Schema.Struct({
      status: Schema.Literal("reconnecting"),
      error: Schema.optionalKey(Schema.NonEmptyString),
    }),
    Schema.Struct({
      status: Schema.Literal("failed"),
      error: Schema.NonEmptyString,
    }),
  ],
)

const sessionSnapshotSchema = Schema.Struct({
  session: sessionSummarySchema,
  messages: sessionMessagesSchema,
  transport: transportSchema,
})

const sessionChangeSchema = Schema.Union(
  [
    Schema.Struct({ type: Schema.Literal("session"), session: sessionSummarySchema }),
    Schema.Struct({ type: Schema.Literal("message"), message: sessionMessageSchema }),
    Schema.Struct({ type: Schema.Literal("messages"), messages: sessionMessagesSchema }),
    Schema.Struct({ type: Schema.Literal("transport"), transport: transportSchema }),
  ],
)

const envelopeFields = {
  sessionId: Schema.NonEmptyString,
  generation: Schema.NonEmptyString,
  revision: Schema.Natural,
}

const snapshotEnvelopeSchema = Schema.Struct({
  ...envelopeFields,
  snapshot: sessionSnapshotSchema,
}).check(
  Schema.makeFilter((envelope) => envelope.sessionId === envelope.snapshot.session.id
    ? undefined
    : {
        issue: "snapshot session id must match its envelope",
        path: ["snapshot", "session", "id"],
      }),
)

const changeEnvelopeSchema = Schema.Struct({
  ...envelopeFields,
  change: sessionChangeSchema,
}).check(
  Schema.makeFilter((envelope) => envelope.change.type !== "session" ||
      envelope.sessionId === envelope.change.session.id
    ? undefined
    : {
        issue: "changed session id must match its envelope",
        path: ["change", "session", "id"],
      }),
)

/** Safe failure returned when a cross-process session payload is invalid. */
export class PrimeSessionProtocolError extends Error {
  readonly _tag = "PrimeSessionProtocolError"

  /** Creates a safe error without retaining the rejected payload. */
  constructor(readonly envelope: "change" | "snapshot") {
    super(`Prime Agent returned an invalid session ${envelope} envelope`)
    this.name = "PrimeSessionProtocolError"
  }
}

/** Result of parsing one unknown cross-process payload. */
export type PrimeSessionParseResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: PrimeSessionProtocolError }>

/** Parses an unknown authoritative session snapshot envelope. */
export function parsePrimeSessionSnapshotEnvelope(
  input: unknown,
): PrimeSessionParseResult<PrimeSessionSnapshotEnvelope> {
  const parsed = Schema.decodeUnknownOption(snapshotEnvelopeSchema, strictParseOptions)(input)
  return Option.isSome(parsed)
    ? { ok: true, value: parsed.value }
    : { ok: false, error: new PrimeSessionProtocolError("snapshot") }
}

/** Parses an unknown ordered session change envelope. */
export function parsePrimeSessionChangeEnvelope(
  input: unknown,
): PrimeSessionParseResult<PrimeSessionChangeEnvelope> {
  const parsed = Schema.decodeUnknownOption(changeEnvelopeSchema, strictParseOptions)(input)
  return Option.isSome(parsed)
    ? { ok: true, value: parsed.value }
    : { ok: false, error: new PrimeSessionProtocolError("change") }
}

/** Maximum live changes retained while an authoritative snapshot is pending. */
export const PRIME_SESSION_CHANGE_BUFFER_LIMIT = 256

/** Reason the renderer must request another authoritative session snapshot. */
export type PrimeSessionRecoveryReason =
  | "buffer-overflow"
  | "generation-changed"
  | "revision-gap"

type ObservedRevision = Readonly<{
  generation: string
  revision: number
}>

/** Pure synchronization state for one renderer attachment. */
export type PrimeSessionSyncState =
  | Readonly<{
      status: "attaching"
      sessionId: string
      bufferedChanges: readonly PrimeSessionChangeEnvelope[]
    }>
  | Readonly<{
      status: "ready"
      envelope: PrimeSessionSnapshotEnvelope
    }>
  | Readonly<{
      status: "recovering"
      sessionId: string
      reason: PrimeSessionRecoveryReason
      lastSnapshot?: PrimeSessionSnapshotEnvelope
      bufferedChanges: readonly PrimeSessionChangeEnvelope[]
      latestObserved?: ObservedRevision
    }>

/** Starts synchronization before the renderer requests its first snapshot. */
export function createPrimeSessionSyncState(sessionId: string): PrimeSessionSyncState {
  return { status: "attaching", sessionId, bufferedChanges: [] }
}

/** Applies an ordered change or enters recovery when ordering cannot be proven. */
export function reducePrimeSessionChange(
  state: PrimeSessionSyncState,
  envelope: PrimeSessionChangeEnvelope,
): PrimeSessionSyncState {
  if (sessionIdOf(state) !== envelope.sessionId) return state
  if (state.status === "ready") return reduceReadyChange(state.envelope, envelope)
  if (state.status === "recovering" && state.reason === "buffer-overflow") {
    return {
      ...state,
      latestObserved: newestObserved(state.latestObserved, envelope),
    }
  }
  if (state.bufferedChanges.length >= PRIME_SESSION_CHANGE_BUFFER_LIMIT) {
    return {
      status: "recovering",
      sessionId: state.sessionId,
      reason: "buffer-overflow",
      lastSnapshot: state.status === "recovering" ? state.lastSnapshot : undefined,
      bufferedChanges: [],
      latestObserved: newestObserved(undefined, envelope),
    }
  }
  return { ...state, bufferedChanges: [...state.bufferedChanges, envelope] }
}

/** Applies an authoritative snapshot and any changes buffered after subscription. */
export function reducePrimeSessionSnapshot(
  state: PrimeSessionSyncState,
  envelope: PrimeSessionSnapshotEnvelope,
): PrimeSessionSyncState {
  if (sessionIdOf(state) !== envelope.sessionId) return state
  if (state.status === "ready") {
    if (
      state.envelope.generation === envelope.generation &&
      envelope.revision < state.envelope.revision
    ) {
      return state
    }
    return { status: "ready", envelope }
  }
  if (
    state.status === "recovering" &&
    state.reason === "buffer-overflow" &&
    state.latestObserved &&
    !coversObserved(envelope, state.latestObserved)
  ) {
    return { ...state, lastSnapshot: envelope }
  }

  let next: PrimeSessionSyncState = { status: "ready", envelope }
  for (const change of state.bufferedChanges) {
    if (change.generation !== envelope.generation) continue
    next = reducePrimeSessionChange(next, change)
    if (next.status !== "ready") return next
  }
  return next
}

/** Returns the last safe snapshot while attachment or recovery continues. */
export function getPrimeSessionSnapshotEnvelope(
  state: PrimeSessionSyncState,
): PrimeSessionSnapshotEnvelope | undefined {
  if (state.status === "ready") return state.envelope
  return state.status === "recovering" ? state.lastSnapshot : undefined
}

function reduceReadyChange(
  current: PrimeSessionSnapshotEnvelope,
  envelope: PrimeSessionChangeEnvelope,
): PrimeSessionSyncState {
  if (current.generation !== envelope.generation) {
    return recovering(current, envelope, "generation-changed")
  }
  if (envelope.revision <= current.revision) {
    return { status: "ready", envelope: current }
  }
  if (envelope.revision !== current.revision + 1) {
    return recovering(current, envelope, "revision-gap")
  }
  return {
    status: "ready",
    envelope: {
      sessionId: current.sessionId,
      generation: current.generation,
      revision: envelope.revision,
      snapshot: applyChange(current.snapshot, envelope.change),
    },
  }
}

function recovering(
  current: PrimeSessionSnapshotEnvelope,
  envelope: PrimeSessionChangeEnvelope,
  reason: PrimeSessionRecoveryReason,
): PrimeSessionSyncState {
  return {
    status: "recovering",
    sessionId: current.sessionId,
    reason,
    lastSnapshot: current,
    bufferedChanges: [envelope],
  }
}

function applyChange(
  snapshot: PrimeSessionSnapshot,
  change: PrimeSessionChange,
): PrimeSessionSnapshot {
  switch (change.type) {
    case "session":
      return { ...snapshot, session: change.session }
    case "message": {
      const index = snapshot.messages.findIndex(({ id }) => id === change.message.id)
      if (index === -1) {
        return { ...snapshot, messages: [...snapshot.messages, change.message] }
      }
      return {
        ...snapshot,
        messages: snapshot.messages.map((message, messageIndex) =>
          messageIndex === index ? change.message : message
        ),
      }
    }
    case "messages":
      return { ...snapshot, messages: change.messages }
    case "transport":
      return { ...snapshot, transport: change.transport }
  }
}

function sessionIdOf(state: PrimeSessionSyncState) {
  return state.status === "ready" ? state.envelope.sessionId : state.sessionId
}

function newestObserved(
  current: ObservedRevision | undefined,
  envelope: PrimeSessionChangeEnvelope,
): ObservedRevision {
  if (!current || current.generation !== envelope.generation) {
    return { generation: envelope.generation, revision: envelope.revision }
  }
  return {
    generation: current.generation,
    revision: Math.max(current.revision, envelope.revision),
  }
}

function coversObserved(
  envelope: PrimeSessionSnapshotEnvelope,
  observed: ObservedRevision,
) {
  return envelope.generation === observed.generation && envelope.revision >= observed.revision
}
