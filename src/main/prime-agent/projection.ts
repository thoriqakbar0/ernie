import { Option, Schema } from "effect"

import type {
  PrimeJsonValue,
  PrimeModel,
  PrimeRlmChild,
  PrimeSessionActions,
  PrimeSessionChange,
  PrimeSessionMessage,
  PrimeSessionSnapshot,
  PrimeSessionSummary,
  PrimeStructuredMessage,
  PrimeUsefulSessionContext,
  PrimeUsefulSessionState,
} from "../../packages/prime-agent"

const recordSchema = Schema.Record(Schema.String, Schema.Unknown)

/** Projects an unknown Prime Agent 0.8.1 connection snapshot into Ernie's JSON contract. */
export function projectPrimeSessionSnapshot(
  input: unknown,
  previousSession?: PrimeSessionSummary,
): PrimeSessionSnapshot {
  const snapshot = readRecord(input, "connection snapshot")
  const state = readRecord(snapshot.state, "connection state")
  const sessionId = readString(state.activeSessionId) ??
    readString(state.sessionId) ??
    previousSession?.id
  const cwd = readString(state.cwd) ?? previousSession?.cwd
  if (!sessionId || !cwd) {
    throw new Error("Prime Agent returned a session snapshot without an identity or working directory")
  }

  const finalizedMessages = readStructuredMessages(snapshot.messages, "connection messages")
  const streamingMessage = snapshot.streamingMessage === undefined
    ? undefined
    : readStructuredMessage(snapshot.streamingMessage, "streaming message")
  const messages = [...finalizedMessages, ...(streamingMessage ? [streamingMessage] : [])]
    .flatMap((value, index) => toSessionMessage(value, sessionId, index))
  const lifecycle = previousSession?.lifecycle === "draft" && messages.some(({ role }) => role === "user")
    ? "live"
    : previousSession?.lifecycle ?? "live"
  const useful = projectUsefulSessionContext(snapshot, state, finalizedMessages, streamingMessage)

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
    useful,
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

  if (!sameJson(structuredState(previous.useful), structuredState(next.useful))) {
    changes.push({
      type: "structured",
      structuredMessages: next.useful.structuredMessages,
      ...(next.useful.streamingMessage
        ? { streamingMessage: next.useful.streamingMessage }
        : {}),
    })
  }
  if (!sameJson(previous.useful.state, next.useful.state)) {
    changes.push({ type: "usefulState", state: next.useful.state })
  }
  if (!sameJson(previous.useful.sessionContext, next.useful.sessionContext)) {
    changes.push({
      type: "sessionContext",
      ...(next.useful.sessionContext ? { sessionContext: next.useful.sessionContext } : {}),
    })
  }
  if (!sameJson(familyState(previous.useful), familyState(next.useful))) {
    changes.push({
      type: "family",
      ...(next.useful.parent ? { parent: next.useful.parent } : {}),
      ...(next.useful.sessionTree ? { sessionTree: next.useful.sessionTree } : {}),
      children: next.useful.children,
    })
  }
  if (!sameJson(eventPosition(previous.useful), eventPosition(next.useful))) {
    changes.push({
      type: "eventPosition",
      ...eventPosition(next.useful),
    })
  }
  if (!sameJson(previous.transport, next.transport)) {
    changes.push({ type: "transport", transport: next.transport })
  }
  return changes
}

function projectUsefulSessionContext(
  snapshot: Record<string, unknown>,
  state: Record<string, unknown>,
  structuredMessages: readonly PrimeStructuredMessage[],
  streamingMessage: PrimeStructuredMessage | undefined,
): PrimeUsefulSessionContext {
  return {
    state: projectUsefulSessionState(state),
    structuredMessages,
    ...(streamingMessage ? { streamingMessage } : {}),
    ...projectSessionContext(snapshot.sessionContext),
    ...projectSessionTree(snapshot.sessionTree),
    ...projectParent(snapshot.parent),
    children: (snapshot.children === undefined
      ? []
      : readArray(snapshot.children, "RLM children")).map(projectRlmChild),
    ...optionalNumberField("lastEventSequence", snapshot.lastEventSequence),
    ...projectCursorField("lastEventCursor", snapshot.lastEventCursor),
    ...projectReplay(snapshot.replay),
  }
}

function projectUsefulSessionState(state: Record<string, unknown>): PrimeUsefulSessionState {
  return {
    ...optionalStringField("activeSessionId", state.activeSessionId),
    sessionId: readRequiredString(state.sessionId, "session state id"),
    cwd: readRequiredString(state.cwd, "session working directory"),
    ...optionalStringField("sessionName", state.sessionName),
    ...optionalStringField("sessionFile", state.sessionFile),
    ...optionalStringField("sessionDir", state.sessionDir),
    leafId: readNullableString(state.leafId, "session leaf id"),
    ...optionalModelField(state.model),
    thinkingLevel: readRequiredString(state.thinkingLevel, "thinking level"),
    serviceTier: readRequiredString(state.serviceTier, "service tier"),
    availableThinkingLevels: readStringArray(state.availableThinkingLevels, "thinking levels"),
    isStreaming: readBoolean(state.isStreaming, "streaming state"),
    isCompacting: readBoolean(state.isCompacting, "compaction state"),
    isBashRunning: readBoolean(state.isBashRunning, "bash state"),
    retryAttempt: readNumber(state.retryAttempt, "retry attempt"),
    steeringMode: readQueueMode(state.steeringMode, "steering mode"),
    followUpMode: readQueueMode(state.followUpMode, "follow-up mode"),
    autoCompactionEnabled: readBoolean(state.autoCompactionEnabled, "auto-compaction state"),
    messageCount: readNumber(state.messageCount, "message count"),
    sessionActions: projectSessionActions(state.sessionActions),
    compactionCount: readNumber(state.compactionCount, "compaction count"),
    goal: readJsonValue(state.goal, "goal state"),
    ...optionalJsonField("heartbeat", state.heartbeat, true),
    scopedModels: readArray(state.scopedModels, "scoped models").map(projectScopedModel),
    activeToolNames: readStringArray(state.activeToolNames, "active tool names"),
    contextUsage: state.contextUsage === undefined
      ? null
      : readJsonValue(state.contextUsage, "context usage"),
    ...optionalStringField("recap", state.recap),
  }
}

function projectSessionActions(value: unknown): PrimeSessionActions {
  const actions = readRecord(value, "session actions")
  const active = actions.active === undefined
    ? undefined
    : readRecord(actions.active, "active session action")
  return {
    queuedCount: readNumber(actions.queuedCount, "queued action count"),
    steering: readStringArray(actions.steering, "steering queue"),
    followUps: readStringArray(actions.followUps, "follow-up queue"),
    ...(active ? {
      active: {
        kind: readActionKind(active.kind),
        phase: readActionPhase(active.phase),
        ...optionalStringField("label", active.label),
      },
    } : {}),
  }
}

function projectScopedModel(value: unknown) {
  const scoped = readRecord(value, "scoped model")
  const model = readModel(scoped.model)
  if (!model) throw new Error("Prime Agent returned an invalid scoped model")
  return { model, ...optionalStringField("thinkingLevel", scoped.thinkingLevel) }
}

function projectRlmChild(value: unknown): PrimeRlmChild {
  const child = readRecord(value, "RLM child")
  const activity = child.activity === undefined
    ? undefined
    : readRecord(child.activity, "RLM child activity")
  return {
    id: readRequiredString(child.id, "RLM child id"),
    ...optionalStringField("parentId", child.parentId),
    ...optionalStringField("activeSessionId", child.activeSessionId),
    ...optionalStringField("sessionName", child.sessionName),
    ...optionalStringField("model", child.model),
    label: readRequiredString(child.label, "RLM child label"),
    status: readChildStatus(child.status),
    ...optionalNumberField("durationMs", child.durationMs),
    ...optionalStringField("answerPreview", child.answerPreview),
    ...optionalBooleanField("repliedSinceTask", child.repliedSinceTask),
    ...optionalNumberField("toolUseCount", child.toolUseCount),
    ...optionalNumberField("tokenCount", child.tokenCount),
    ...optionalStringField("recap", child.recap),
    sessionDir: readRequiredString(child.sessionDir, "RLM child session directory"),
    ...(activity ? {
      activity: {
        kind: readActivityKind(activity.kind),
        ...optionalStringField("toolName", activity.toolName),
      },
    } : {}),
    ...optionalStringField("error", child.error),
  }
}

function projectSessionContext(
  value: unknown,
): Pick<PrimeUsefulSessionContext, "sessionContext"> | Record<string, never> {
  if (value === undefined) return {}
  const context = readRecord(value, "session context")
  const model = context.model === null
    ? null
    : readRecord(context.model, "session context model")
  return {
    sessionContext: {
      messages: readStructuredMessages(context.messages, "session context messages"),
      thinkingLevel: readRequiredString(context.thinkingLevel, "session context thinking level"),
      serviceTier: readRequiredString(context.serviceTier, "session context service tier"),
      model: model === null ? null : {
        provider: readRequiredString(model.provider, "session context model provider"),
        modelId: readRequiredString(model.modelId, "session context model id"),
      },
    },
  }
}

function projectSessionTree(
  value: unknown,
): Pick<PrimeUsefulSessionContext, "sessionTree"> | Record<string, never> {
  if (value === undefined) return {}
  const sessionTree = readRecord(value, "session tree")
  return {
    sessionTree: {
      tree: readJsonValue(sessionTree.tree, "session tree nodes"),
      leafId: readNullableString(sessionTree.leafId, "session tree leaf id"),
    },
  }
}

function projectParent(
  value: unknown,
): Pick<PrimeUsefulSessionContext, "parent"> | Record<string, never> {
  if (value === undefined) return {}
  const parent = readRecord(value, "parent metadata")
  return {
    parent: {
      ...optionalStringField("activeSessionId", parent.activeSessionId),
      ...optionalStringField("sessionId", parent.sessionId),
      ...optionalStringField("nodeId", parent.nodeId),
      ...optionalStringField("childId", parent.childId),
    },
  }
}

function projectReplay(
  value: unknown,
): Pick<PrimeUsefulSessionContext, "replay"> | Record<string, never> {
  if (value === undefined) return {}
  const replay = readRecord(value, "replay metadata")
  return {
    replay: {
      status: readReplayStatus(replay.status),
      ...optionalNumberField("fromSequence", replay.fromSequence),
      toSequence: readNumber(replay.toSequence, "replay sequence"),
      ...projectCursorField("fromCursor", replay.fromCursor),
      ...projectCursorField("toCursor", replay.toCursor),
      ...optionalStringField("reason", replay.reason),
    },
  }
}

function projectCursorField<Name extends string>(name: Name, value: unknown) {
  if (value === undefined) return {}
  const cursor = readRecord(value, `${name} cursor`)
  return {
    [name]: {
      generation: readRequiredString(cursor.generation, `${name} generation`),
      sequence: readNumber(cursor.sequence, `${name} sequence`),
    },
  } as Record<Name, Readonly<{ generation: string; sequence: number }>>
}

function readSessionState(state: Record<string, unknown>): PrimeSessionSummary["state"] {
  if (state.workerState === "recovering") return "recovering"
  return state.isStreaming === true || state.isCompacting === true || state.isBashRunning === true
    ? "working"
    : "idle"
}

function readModel(value: unknown): PrimeModel | undefined {
  const model = asRecord(value)
  const id = readString(model?.id)
  const provider = readString(model?.provider)
  if (!id || !provider) return undefined
  return { id, provider, label: readString(model?.name) ?? id }
}

function optionalModelField(value: unknown) {
  const model = readModel(value)
  return model ? { model } : {}
}

function toSessionMessage(
  message: PrimeStructuredMessage,
  sessionId: string,
  index: number,
): PrimeSessionMessage[] {
  const role = message.role
  if (role !== "assistant" && role !== "system" && role !== "user") return []
  const content = readMessageContent(message.content)
  if (!content) return []
  const timestamp = typeof message.timestamp === "number" ? message.timestamp : "unknown"
  return [{
    id: typeof message.id === "string" && message.id.length > 0
      ? message.id
      : `${sessionId}:${role}:${timestamp}:${index}`,
    role,
    content,
  }]
}

function readMessageContent(value: PrimeJsonValue | undefined): string {
  if (typeof value === "string") return value
  if (!Array.isArray(value)) return ""
  return value.flatMap((part) => {
    if (!isJsonRecord(part)) return []
    return part.type === "text" && typeof part.text === "string" ? [part.text] : []
  }).join("")
}

function readStructuredMessages(value: unknown, label: string): readonly PrimeStructuredMessage[] {
  return readArray(value, label).map((message) => readStructuredMessage(message, label))
}

function readStructuredMessage(value: unknown, label: string): PrimeStructuredMessage {
  const json = readJsonValue(value, label)
  if (!isJsonRecord(json)) throw new Error(`Prime Agent returned an invalid ${label}`)
  return json
}

function readJsonValue(value: unknown, label: string): PrimeJsonValue {
  const projected = toJsonValue(value, new WeakSet(), label)
  if (projected === undefined) throw new Error(`Prime Agent returned a non-JSON ${label}`)
  return projected
}

function toJsonValue(
  value: unknown,
  seen: WeakSet<object>,
  label: string,
): PrimeJsonValue | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Prime Agent returned a non-JSON ${label}`)
    return value
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error(`Prime Agent returned a cyclic ${label}`)
    seen.add(value)
    const projected = value.map((entry) =>
      toJsonValue(entry, seen, label) ?? null
    )
    seen.delete(value)
    return projected
  }
  const record = asRecord(value)
  if (!record) return undefined
  if (seen.has(record)) throw new Error(`Prime Agent returned a cyclic ${label}`)
  seen.add(record)
  const projected: Record<string, PrimeJsonValue> = {}
  for (const [key, entry] of Object.entries(record)) {
    const item = toJsonValue(entry, seen, label)
    if (item !== undefined) projected[key] = item
  }
  seen.delete(record)
  return projected
}

function isJsonRecord(value: PrimeJsonValue): value is Readonly<{ [key: string]: PrimeJsonValue }> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function structuredState(useful: PrimeUsefulSessionContext) {
  return {
    structuredMessages: useful.structuredMessages,
    ...(useful.streamingMessage ? { streamingMessage: useful.streamingMessage } : {}),
  }
}

function familyState(useful: PrimeUsefulSessionContext) {
  return {
    ...(useful.parent ? { parent: useful.parent } : {}),
    ...(useful.sessionTree ? { sessionTree: useful.sessionTree } : {}),
    children: useful.children,
  }
}

function eventPosition(useful: PrimeUsefulSessionContext) {
  return {
    ...optionalNumberField("lastEventSequence", useful.lastEventSequence),
    ...(useful.lastEventCursor ? { lastEventCursor: useful.lastEventCursor } : {}),
    ...(useful.replay ? { replay: useful.replay } : {}),
  }
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

function readArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`Prime Agent returned invalid ${label}`)
  return value
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readRequiredString(value: unknown, label: string) {
  const parsed = readString(value)
  if (!parsed) throw new Error(`Prime Agent returned an invalid ${label}`)
  return parsed
}

function readNullableString(value: unknown, label: string) {
  if (value === null) return null
  return readRequiredString(value, label)
}

function readStringArray(value: unknown, label: string) {
  return readArray(value, label).map((entry) => readRequiredString(entry, label))
}

function readBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`Prime Agent returned an invalid ${label}`)
  return value
}

function readNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Prime Agent returned an invalid ${label}`)
  }
  return value
}

function optionalStringField<Name extends string>(name: Name, value: unknown) {
  const parsed = readString(value)
  return parsed ? { [name]: parsed } as Record<Name, string> : {}
}

function optionalNumberField<Name extends string>(name: Name, value: unknown) {
  return value === undefined ? {} : { [name]: readNumber(value, name) } as Record<Name, number>
}

function optionalBooleanField<Name extends string>(name: Name, value: unknown) {
  return value === undefined ? {} : { [name]: readBoolean(value, name) } as Record<Name, boolean>
}

function optionalJsonField<Name extends string>(name: Name, value: unknown, allowNull = false) {
  if (value === undefined) return {}
  if (value === null && allowNull) return { [name]: null } as Record<Name, null>
  return { [name]: readJsonValue(value, name) } as Record<Name, PrimeJsonValue>
}

function readQueueMode(value: unknown, label: string) {
  if (value === "all" || value === "one-at-a-time") return value
  throw new Error(`Prime Agent returned an invalid ${label}`)
}

function readActionKind(value: unknown) {
  if (value === "turn" || value === "session_command") return value
  throw new Error("Prime Agent returned an invalid session action kind")
}

function readActionPhase(value: unknown) {
  if (value === "preparing" || value === "committing" || value === "running") return value
  throw new Error("Prime Agent returned an invalid session action phase")
}

function readChildStatus(value: unknown) {
  if (value === "queued" || value === "running" || value === "done" || value === "error" || value === "cancelled") return value
  throw new Error("Prime Agent returned an invalid RLM child status")
}

function readActivityKind(value: unknown) {
  if (value === "waiting" || value === "writing" || value === "executing") return value
  throw new Error("Prime Agent returned an invalid RLM child activity")
}

function readReplayStatus(value: unknown) {
  if (value === "complete" || value === "partial" || value === "unavailable") return value
  throw new Error("Prime Agent returned invalid replay metadata")
}
