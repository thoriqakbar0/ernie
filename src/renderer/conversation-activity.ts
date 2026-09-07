import { Option, Schema } from "effect"
import type { PrimeSessionSnapshot } from "../packages/prime-agent"

const ToolResult = Schema.Struct({
  content: Schema.Array(Schema.Unknown),
  isError: Schema.Boolean,
  role: Schema.Literal("toolResult"),
  toolCallId: Schema.String,
  toolName: Schema.String,
})
const AssistantMessage = Schema.Struct({
  content: Schema.Array(Schema.Unknown),
  role: Schema.Literal("assistant"),
})
const ResponseEnd = Schema.Struct({ role: Schema.Literal("assistant"), stopReason: Schema.String })
const decodeResponseEnd = Schema.decodeUnknownOption(ResponseEnd)
const PythonCall = Schema.Struct({
  arguments: Schema.Struct({ code: Schema.String }),
  id: Schema.String,
  name: Schema.Literals(["ipython", "python"]),
  type: Schema.Literal("toolCall"),
})
const decodeAssistant = Schema.decodeUnknownOption(AssistantMessage)
const decodePython = Schema.decodeUnknownOption(PythonCall)
const TextPart = Schema.Struct({ text: Schema.String, type: Schema.Literal("text") })
const decodeResult = Schema.decodeUnknownOption(ToolResult)
const decodeText = Schema.decodeUnknownOption(TextPart)

/** Safe presentation of an authoritative tool result; excludes reasoning and exposes only validated Python source. */
type ConversationToolResult = Readonly<{
  id: string
  name: string
  failed: boolean
  pending: boolean
  text: string
  code?: string
}>

const describeResponseStatus = (settled: boolean, ending: string | undefined) => {
  if (!settled) {
    return
  }
  if (ending === "stop") {
    return "Response complete"
  }
  if (ending === "aborted") {
    return "Stopped"
  }
  if (ending === "error") {
    return "Response failed"
  }
  if (ending === "length") {
    return "Response limit reached"
  }
}

const describeActivitySummary = (snapshot: PrimeSessionSnapshot, resultCount: number) => {
  const { session, useful, transport } = snapshot
  const { state } = useful
  if (transport.status !== "connected") {
    return "Activity unavailable while disconnected"
  }
  if (session.state === "recovering") {
    return "Restoring this conversation…"
  }
  if (session.workerFailed) {
    return "A worker reported a failure"
  }
  if (session.state === "working") {
    return (
      session.activitySummary ||
      state.sessionActions.active?.label ||
      (state.activeToolNames.length ? `Using ${state.activeToolNames.join(", ")}` : "Working…")
    )
  }
  return resultCount ? "Execution details" : undefined
}

/** Parses tool history independently of connection and activity status updates. */
export const describeConversationToolResults = (
  structuredMessages: PrimeSessionSnapshot["useful"]["structuredMessages"],
  streamingMessage: PrimeSessionSnapshot["useful"]["streamingMessage"],
): readonly ConversationToolResult[] => {
  const runs = new Map<string, ConversationToolResult>()
  for (const message of [...structuredMessages, streamingMessage]) {
    const assistant = Option.getOrUndefined(decodeAssistant(message))
    for (const part of assistant?.content ?? []) {
      const call = Option.getOrUndefined(decodePython(part))
      if (call && !runs.has(call.id)) {
        runs.set(call.id, {
          code: call.arguments.code,
          failed: false,
          id: call.id,
          name: call.name,
          pending: true,
          text: "",
        })
      }
    }
    const parsed = Option.getOrUndefined(decodeResult(message))
    if (!parsed) {
      continue
    }
    const text = parsed.content
      .flatMap((part) => {
        const decoded = Option.getOrUndefined(decodeText(part))
        return decoded ? [decoded.text] : []
      })
      .join("\n")
    runs.set(parsed.toolCallId, {
      code: runs.get(parsed.toolCallId)?.code,
      failed: parsed.isError,
      id: parsed.toolCallId,
      name: parsed.toolName,
      pending: false,
      text,
    })
  }
  return [...runs.values()]
}

/** Projects current runtime status alongside the corresponding parsed tool results. */
export const describeConversationActivity = (
  snapshot: PrimeSessionSnapshot,
  results: readonly ConversationToolResult[],
) => {
  const { session, useful, transport } = snapshot
  const { state } = useful
  const action = state.sessionActions.active
  // Only the last finalized message can establish completion; a newer user/tool
  // message invalidates an older response's stop reason.
  const lastMessage = useful.structuredMessages.at(-1)
  const ending = Option.getOrUndefined(decodeResponseEnd(lastMessage))?.stopReason
  const settled =
    !useful.streamingMessage &&
    !state.isStreaming &&
    !state.sessionActions.active &&
    state.sessionActions.queuedCount === 0
  const responseStatus = describeResponseStatus(settled, ending)
  const active = session.state === "working"
  const summary = describeActivitySummary(snapshot, results.length)
  return {
    active: active && transport.status === "connected",
    children: useful.children,
    followUps: state.sessionActions.followUps,
    phase: active ? action?.phase : undefined,
    queued: state.sessionActions.queuedCount,
    responseStatus,
    results,
    summary,
    tools: active ? state.activeToolNames : [],
  }
}
