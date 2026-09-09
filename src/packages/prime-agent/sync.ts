import { Option, Schema } from "effect"
import { PrimeDaemonConnectionSchema } from "./index"

import type {
  PrimeSessionChange,
  PrimeSessionChangeEnvelope,
  PrimeJsonValue,
  PrimeSessionSnapshot,
  PrimeSessionSnapshotEnvelope,
  PrimeSessionState,
} from "./index"

const strictParseOptions = { onExcessProperty: "error" } as const
const finiteNumberSchema = Schema.Number.check(
  Schema.makeFilter((value) =>
    Number.isFinite(value) ? undefined : "JSON numbers must be finite",
  ),
)

const jsonValueSchema: Schema.Codec<PrimeJsonValue> = Schema.Union([
  Schema.Boolean,
  Schema.Null,
  finiteNumberSchema,
  Schema.String,
  Schema.Array(Schema.suspend((): Schema.Codec<PrimeJsonValue> => jsonValueSchema)),
  Schema.Record(
    Schema.String,
    Schema.suspend((): Schema.Codec<PrimeJsonValue> => jsonValueSchema),
  ),
])

const modelSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  provider: Schema.NonEmptyString,
})

const structuredMessageSchema = Schema.Record(Schema.String, jsonValueSchema)

const cursorSchema = Schema.Struct({
  generation: Schema.NonEmptyString,
  sequence: Schema.Natural,
})

const sessionActionsSchema = Schema.Struct({
  active: Schema.optionalKey(
    Schema.Struct({
      kind: Schema.Literals(["session_command", "turn"]),
      label: Schema.optionalKey(Schema.NonEmptyString),
      phase: Schema.Literals(["committing", "preparing", "running"]),
    }),
  ),
  followUps: Schema.Array(Schema.String),
  queuedCount: Schema.Natural,
  steering: Schema.Array(Schema.String),
})

const rlmChildSchema = Schema.Struct({
  activeSessionId: Schema.optionalKey(Schema.NonEmptyString),
  activity: Schema.optionalKey(
    Schema.Struct({
      kind: Schema.Literals(["executing", "waiting", "writing"]),
      toolName: Schema.optionalKey(Schema.NonEmptyString),
    }),
  ),
  answerPreview: Schema.optionalKey(Schema.String),
  durationMs: Schema.optionalKey(Schema.Natural),
  error: Schema.optionalKey(Schema.String),
  id: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  model: Schema.optionalKey(Schema.NonEmptyString),
  parentId: Schema.optionalKey(Schema.NonEmptyString),
  recap: Schema.optionalKey(Schema.String),
  repliedSinceTask: Schema.optionalKey(Schema.Boolean),
  sessionDir: Schema.NonEmptyString,
  sessionName: Schema.optionalKey(Schema.NonEmptyString),
  status: Schema.Literals(["cancelled", "done", "error", "queued", "running"]),
  tokenCount: Schema.optionalKey(Schema.Natural),
  toolUseCount: Schema.optionalKey(Schema.Natural),
})

const usefulStateSchema = Schema.Struct({
  activeSessionId: Schema.optionalKey(Schema.NonEmptyString),
  activeToolNames: Schema.Array(Schema.NonEmptyString),
  autoCompactionEnabled: Schema.Boolean,
  availableThinkingLevels: Schema.Array(Schema.NonEmptyString),
  compactionCount: Schema.Natural,
  contextUsage: jsonValueSchema,
  cwd: Schema.NonEmptyString,
  followUpMode: Schema.Literals(["all", "one-at-a-time"]),
  goal: jsonValueSchema,
  heartbeat: Schema.optionalKey(Schema.NullOr(jsonValueSchema)),
  isBashRunning: Schema.Boolean,
  isCompacting: Schema.Boolean,
  isStreaming: Schema.Boolean,
  leafId: Schema.NullOr(Schema.NonEmptyString),
  messageCount: Schema.Natural,
  model: Schema.optionalKey(modelSchema),
  recap: Schema.optionalKey(Schema.String),
  retryAttempt: Schema.Natural,
  scopedModels: Schema.Array(
    Schema.Struct({
      model: modelSchema,
      thinkingLevel: Schema.optionalKey(Schema.NonEmptyString),
    }),
  ),
  serviceTier: Schema.NonEmptyString,
  sessionActions: sessionActionsSchema,
  sessionDir: Schema.optionalKey(Schema.NonEmptyString),
  sessionFile: Schema.optionalKey(Schema.NonEmptyString),
  sessionId: Schema.NonEmptyString,
  sessionName: Schema.optionalKey(Schema.NonEmptyString),
  steeringMode: Schema.Literals(["all", "one-at-a-time"]),
  thinkingLevel: Schema.NonEmptyString,
})

const usefulContextSchema = Schema.Struct({
  children: Schema.Array(rlmChildSchema).check(
    Schema.makeFilter((children) => {
      const ids = new Set<string>()
      const issues: Schema.FilterIssue[] = []
      for (const [index, child] of children.entries()) {
        if (!ids.has(child.id)) {
          ids.add(child.id)
          continue
        }
        issues.push({ issue: "RLM child ids must be unique", path: [index, "id"] })
      }
      return issues
    }),
  ),
  childrenAvailable: Schema.optionalKey(Schema.Boolean),
  lastEventCursor: Schema.optionalKey(cursorSchema),
  lastEventSequence: Schema.optionalKey(Schema.Natural),
  parent: Schema.optionalKey(
    Schema.Struct({
      activeSessionId: Schema.optionalKey(Schema.NonEmptyString),
      childId: Schema.optionalKey(Schema.NonEmptyString),
      nodeId: Schema.optionalKey(Schema.NonEmptyString),
      sessionId: Schema.optionalKey(Schema.NonEmptyString),
    }),
  ),
  replay: Schema.optionalKey(
    Schema.Struct({
      fromCursor: Schema.optionalKey(cursorSchema),
      fromSequence: Schema.optionalKey(Schema.Natural),
      reason: Schema.optionalKey(Schema.String),
      status: Schema.Literals(["complete", "partial", "unavailable"]),
      toCursor: Schema.optionalKey(cursorSchema),
      toSequence: Schema.Natural,
    }),
  ),
  sessionContext: Schema.optionalKey(
    Schema.Struct({
      messages: Schema.Array(structuredMessageSchema),
      model: Schema.NullOr(
        Schema.Struct({
          modelId: Schema.NonEmptyString,
          provider: Schema.NonEmptyString,
        }),
      ),
      serviceTier: Schema.NonEmptyString,
      thinkingLevel: Schema.NonEmptyString,
    }),
  ),
  sessionTree: Schema.optionalKey(
    Schema.Struct({
      leafId: Schema.NullOr(Schema.NonEmptyString),
      tree: jsonValueSchema,
    }),
  ),
  state: usefulStateSchema,
  streamingMessage: Schema.optionalKey(structuredMessageSchema),
  structuredMessages: Schema.Array(structuredMessageSchema),
})

const sessionSummarySchema = Schema.Struct({
  activityAt: Schema.optionalKey(Schema.String),
  activitySummary: Schema.optionalKey(Schema.String),
  cwd: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
  lifecycle: Schema.Literals(["archived", "draft", "live"]),
  model: Schema.optionalKey(modelSchema),
  name: Schema.optionalKey(Schema.NonEmptyString),
  rlmDepth: Schema.optionalKey(Schema.Natural),
  state: Schema.Literals(["idle", "working", "recovering"]),
  workerFailed: Schema.optionalKey(Schema.Boolean),
})

const sessionStateSchema = Schema.Struct({
  connection: Schema.optionalKey(PrimeDaemonConnectionSchema),
  revision: Schema.Natural,
  selectedSessionId: Schema.optionalKey(Schema.NonEmptyString),
  sessions: Schema.Array(sessionSummarySchema),
}).check(
  Schema.makeFilter((state) => {
    const ids = new Set(state.sessions.map(({ id }) => id))
    if (ids.size !== state.sessions.length) {
      return { issue: "session state ids must be unique", path: ["sessions"] }
    }
    if (state.selectedSessionId && !ids.has(state.selectedSessionId)) {
      return { issue: "selected session must exist in session state", path: ["selectedSessionId"] }
    }
  }),
)

const sessionMessageSchema = Schema.Struct({
  content: Schema.String,
  id: Schema.NonEmptyString,
  role: Schema.Literals(["assistant", "system", "user"]),
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

const transportSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal("connected") }),
  Schema.Struct({
    error: Schema.optionalKey(Schema.NonEmptyString),
    status: Schema.Literal("reconnecting"),
  }),
  Schema.Struct({
    error: Schema.NonEmptyString,
    status: Schema.Literal("failed"),
  }),
])

const sessionSnapshotSchema = Schema.Struct({
  messages: sessionMessagesSchema,
  session: sessionSummarySchema,
  transport: transportSchema,
  useful: usefulContextSchema,
})

const sessionChangeSchema = Schema.Union([
  Schema.Struct({ session: sessionSummarySchema, type: Schema.Literal("session") }),
  Schema.Struct({ message: sessionMessageSchema, type: Schema.Literal("message") }),
  Schema.Struct({ messages: sessionMessagesSchema, type: Schema.Literal("messages") }),
  Schema.Struct({
    streamingMessage: Schema.optionalKey(structuredMessageSchema),
    structuredMessages: Schema.Array(structuredMessageSchema),
    type: Schema.Literal("structured"),
  }),
  Schema.Struct({ state: usefulStateSchema, type: Schema.Literal("usefulState") }),
  Schema.Struct({
    sessionContext: Schema.optionalKey(
      Schema.Struct({
        messages: Schema.Array(structuredMessageSchema),
        model: Schema.NullOr(
          Schema.Struct({
            modelId: Schema.NonEmptyString,
            provider: Schema.NonEmptyString,
          }),
        ),
        serviceTier: Schema.NonEmptyString,
        thinkingLevel: Schema.NonEmptyString,
      }),
    ),
    type: Schema.Literal("sessionContext"),
  }),
  Schema.Struct({
    children: Schema.Array(rlmChildSchema),
    childrenAvailable: Schema.optionalKey(Schema.Boolean),
    parent: Schema.optionalKey(
      Schema.Struct({
        activeSessionId: Schema.optionalKey(Schema.NonEmptyString),
        childId: Schema.optionalKey(Schema.NonEmptyString),
        nodeId: Schema.optionalKey(Schema.NonEmptyString),
        sessionId: Schema.optionalKey(Schema.NonEmptyString),
      }),
    ),
    sessionTree: Schema.optionalKey(
      Schema.Struct({
        leafId: Schema.NullOr(Schema.NonEmptyString),
        tree: jsonValueSchema,
      }),
    ),
    type: Schema.Literal("family"),
  }),
  Schema.Struct({
    lastEventCursor: Schema.optionalKey(cursorSchema),
    lastEventSequence: Schema.optionalKey(Schema.Natural),
    replay: Schema.optionalKey(
      Schema.Struct({
        fromCursor: Schema.optionalKey(cursorSchema),
        fromSequence: Schema.optionalKey(Schema.Natural),
        reason: Schema.optionalKey(Schema.String),
        status: Schema.Literals(["complete", "partial", "unavailable"]),
        toCursor: Schema.optionalKey(cursorSchema),
        toSequence: Schema.Natural,
      }),
    ),
    type: Schema.Literal("eventPosition"),
  }),
  Schema.Struct({ transport: transportSchema, type: Schema.Literal("transport") }),
])

const envelopeFields = {
  generation: Schema.NonEmptyString,
  revision: Schema.Natural,
  sessionId: Schema.NonEmptyString,
}

const snapshotEnvelopeSchema = Schema.Struct({
  ...envelopeFields,
  snapshot: sessionSnapshotSchema,
}).check(
  Schema.makeFilter((envelope) =>
    envelope.sessionId === envelope.snapshot.session.id
      ? undefined
      : {
          issue: "snapshot session id must match its envelope",
          path: ["snapshot", "session", "id"],
        },
  ),
)

const changeEnvelopeSchema = Schema.Struct({
  ...envelopeFields,
  change: sessionChangeSchema,
}).check(
  Schema.makeFilter((envelope) =>
    envelope.change.type !== "session" || envelope.sessionId === envelope.change.session.id
      ? undefined
      : {
          issue: "changed session id must match its envelope",
          path: ["change", "session", "id"],
        },
  ),
)

/** Safe failure returned when a cross-process session payload is invalid. */
class PrimeSessionProtocolError extends Error {
  readonly _tag = "PrimeSessionProtocolError"
  readonly envelope: "change" | "snapshot" | "state"

  /** Creates a safe error without retaining the rejected payload. */
  constructor(envelope: "change" | "snapshot" | "state") {
    super(`Prime Agent returned an invalid session ${envelope} envelope`)
    this.envelope = envelope
    this.name = "PrimeSessionProtocolError"
  }
}

/** Parses an unknown authoritative session state. */
export const parsePrimeSessionState = (
  input: unknown,
): PrimeSessionParseResult<PrimeSessionState> => {
  const parsed = Schema.decodeUnknownOption(sessionStateSchema, strictParseOptions)(input)
  return Option.isSome(parsed)
    ? { ok: true, value: parsed.value }
    : { error: new PrimeSessionProtocolError("state"), ok: false }
}

/** Result of parsing one unknown cross-process payload. */
export type PrimeSessionParseResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: PrimeSessionProtocolError }>

/** Parses an unknown authoritative session snapshot envelope. */
export const parsePrimeSessionSnapshotEnvelope = (
  input: unknown,
): PrimeSessionParseResult<PrimeSessionSnapshotEnvelope> => {
  const parsed = Schema.decodeUnknownOption(snapshotEnvelopeSchema, strictParseOptions)(input)
  return Option.isSome(parsed)
    ? { ok: true, value: parsed.value }
    : { error: new PrimeSessionProtocolError("snapshot"), ok: false }
}

/** Parses an unknown ordered session change envelope. */
export const parsePrimeSessionChangeEnvelope = (
  input: unknown,
): PrimeSessionParseResult<PrimeSessionChangeEnvelope> => {
  const parsed = Schema.decodeUnknownOption(changeEnvelopeSchema, strictParseOptions)(input)
  return Option.isSome(parsed)
    ? { ok: true, value: parsed.value }
    : { error: new PrimeSessionProtocolError("change"), ok: false }
}

/** Maximum live changes retained while an authoritative snapshot is pending. */
const PRIME_SESSION_CHANGE_BUFFER_LIMIT = 256

/** Reason the renderer must request another authoritative session snapshot. */
type PrimeSessionRecoveryReason = "buffer-overflow" | "generation-changed" | "revision-gap"

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

const recovering = (
  current: PrimeSessionSnapshotEnvelope,
  envelope: PrimeSessionChangeEnvelope,
  reason: PrimeSessionRecoveryReason,
): PrimeSessionSyncState => ({
  bufferedChanges: [envelope],
  lastSnapshot: current,
  reason,
  sessionId: current.sessionId,
  status: "recovering",
})

const replaceStructuredMessages = (
  useful: PrimeSessionSnapshot["useful"],
  change: Extract<PrimeSessionChange, { type: "structured" }>,
): PrimeSessionSnapshot["useful"] => {
  const { streamingMessage: _streamingMessage, ...rest } = useful
  return {
    ...rest,
    structuredMessages: change.structuredMessages,
    ...(change.streamingMessage ? { streamingMessage: change.streamingMessage } : {}),
  }
}

const replaceSessionContext = (
  useful: PrimeSessionSnapshot["useful"],
  sessionContext: PrimeSessionSnapshot["useful"]["sessionContext"],
): PrimeSessionSnapshot["useful"] => {
  const { sessionContext: _sessionContext, ...rest } = useful
  return { ...rest, ...(sessionContext ? { sessionContext } : {}) }
}

const replaceFamily = (
  useful: PrimeSessionSnapshot["useful"],
  change: Extract<PrimeSessionChange, { type: "family" }>,
): PrimeSessionSnapshot["useful"] => {
  const { parent: _parent, sessionTree: _sessionTree, ...rest } = useful
  return {
    ...rest,
    ...(change.parent ? { parent: change.parent } : {}),
    ...(change.sessionTree ? { sessionTree: change.sessionTree } : {}),
    children: change.children,
    childrenAvailable: change.childrenAvailable,
  }
}

const replaceEventPosition = (
  useful: PrimeSessionSnapshot["useful"],
  change: Extract<PrimeSessionChange, { type: "eventPosition" }>,
): PrimeSessionSnapshot["useful"] => {
  const {
    lastEventSequence: _lastEventSequence,
    lastEventCursor: _lastEventCursor,
    replay: _replay,
    ...rest
  } = useful
  return {
    ...rest,
    ...(change.lastEventSequence === undefined
      ? {}
      : { lastEventSequence: change.lastEventSequence }),
    ...(change.lastEventCursor ? { lastEventCursor: change.lastEventCursor } : {}),
    ...(change.replay ? { replay: change.replay } : {}),
  }
}

const applyChange = (
  snapshot: PrimeSessionSnapshot,
  change: PrimeSessionChange,
): PrimeSessionSnapshot => {
  switch (change.type) {
    case "session": {
      return { ...snapshot, session: change.session }
    }
    case "message": {
      const index = snapshot.messages.findIndex(({ id }) => id === change.message.id)
      if (index === -1) {
        return { ...snapshot, messages: [...snapshot.messages, change.message] }
      }
      return {
        ...snapshot,
        messages: snapshot.messages.map((message, messageIndex) =>
          messageIndex === index ? change.message : message,
        ),
      }
    }
    case "messages": {
      return { ...snapshot, messages: change.messages }
    }
    case "structured": {
      return {
        ...snapshot,
        useful: replaceStructuredMessages(snapshot.useful, change),
      }
    }
    case "usefulState": {
      return { ...snapshot, useful: { ...snapshot.useful, state: change.state } }
    }
    case "sessionContext": {
      return {
        ...snapshot,
        useful: replaceSessionContext(snapshot.useful, change.sessionContext),
      }
    }
    case "family": {
      return {
        ...snapshot,
        useful: replaceFamily(snapshot.useful, change),
      }
    }
    case "eventPosition": {
      return {
        ...snapshot,
        useful: replaceEventPosition(snapshot.useful, change),
      }
    }
    case "transport": {
      return { ...snapshot, transport: change.transport }
    }
    default: {
      throw new Error(`Unexpected session change: ${change satisfies never}`)
    }
  }
}

const reduceReadyChange = (
  current: PrimeSessionSnapshotEnvelope,
  envelope: PrimeSessionChangeEnvelope,
): PrimeSessionSyncState => {
  if (current.generation !== envelope.generation) {
    return recovering(current, envelope, "generation-changed")
  }
  if (envelope.revision <= current.revision) {
    return { envelope: current, status: "ready" }
  }
  if (envelope.revision !== current.revision + 1) {
    return recovering(current, envelope, "revision-gap")
  }
  return {
    envelope: {
      generation: current.generation,
      revision: envelope.revision,
      sessionId: current.sessionId,
      snapshot: applyChange(current.snapshot, envelope.change),
    },
    status: "ready",
  }
}

const sessionIdOf = (state: PrimeSessionSyncState) =>
  state.status === "ready" ? state.envelope.sessionId : state.sessionId

const newestObserved = (
  current: ObservedRevision | undefined,
  envelope: PrimeSessionChangeEnvelope,
): ObservedRevision => {
  if (!current || current.generation !== envelope.generation) {
    return { generation: envelope.generation, revision: envelope.revision }
  }
  return {
    generation: current.generation,
    revision: Math.max(current.revision, envelope.revision),
  }
}

const coversObserved = (envelope: PrimeSessionSnapshotEnvelope, observed: ObservedRevision) =>
  envelope.generation === observed.generation && envelope.revision >= observed.revision

// @lat: [[runtime#Prime Agent runtime#Ordered synchronization]]
/** Starts synchronization before the renderer requests its first snapshot. */
export const createPrimeSessionSyncState = (sessionId: string): PrimeSessionSyncState => ({
  bufferedChanges: [],
  sessionId,
  status: "attaching",
})

/** Applies an ordered change or enters recovery when ordering cannot be proven. */
export const reducePrimeSessionChange = (
  state: PrimeSessionSyncState,
  envelope: PrimeSessionChangeEnvelope,
): PrimeSessionSyncState => {
  if (sessionIdOf(state) !== envelope.sessionId) {
    return state
  }
  if (state.status === "ready") {
    return reduceReadyChange(state.envelope, envelope)
  }
  if (state.status === "recovering" && state.reason === "buffer-overflow") {
    return {
      ...state,
      latestObserved: newestObserved(state.latestObserved, envelope),
    }
  }
  if (state.bufferedChanges.length >= PRIME_SESSION_CHANGE_BUFFER_LIMIT) {
    return {
      bufferedChanges: [],
      lastSnapshot: state.status === "recovering" ? state.lastSnapshot : undefined,
      latestObserved: newestObserved(undefined, envelope),
      reason: "buffer-overflow",
      sessionId: state.sessionId,
      status: "recovering",
    }
  }
  return { ...state, bufferedChanges: [...state.bufferedChanges, envelope] }
}

/** Applies an authoritative snapshot and any changes buffered after subscription. */
export const reducePrimeSessionSnapshot = (
  state: PrimeSessionSyncState,
  envelope: PrimeSessionSnapshotEnvelope,
): PrimeSessionSyncState => {
  if (sessionIdOf(state) !== envelope.sessionId) {
    return state
  }
  if (state.status === "ready") {
    if (
      state.envelope.generation === envelope.generation &&
      envelope.revision < state.envelope.revision
    ) {
      return state
    }
    return { envelope, status: "ready" }
  }
  if (
    state.status === "recovering" &&
    state.reason === "buffer-overflow" &&
    state.latestObserved &&
    !coversObserved(envelope, state.latestObserved)
  ) {
    return { ...state, lastSnapshot: envelope }
  }

  let next: PrimeSessionSyncState = { envelope, status: "ready" }
  for (const change of state.bufferedChanges) {
    if (change.generation !== envelope.generation) {
      continue
    }
    next = reducePrimeSessionChange(next, change)
    if (next.status !== "ready") {
      return next
    }
  }
  return next
}

/** Returns the last safe snapshot while attachment or recovery continues. */
export const getPrimeSessionSnapshotEnvelope = (
  state: PrimeSessionSyncState,
): PrimeSessionSnapshotEnvelope | undefined => {
  if (state.status === "ready") {
    return state.envelope
  }
  return state.status === "recovering" ? state.lastSnapshot : undefined
}
