import { Option, Schema } from "effect"
import type { PrimeSessionSnapshot } from "../packages/prime-agent"

const ToolResult = Schema.Struct({
  role: Schema.Literal("toolResult"),
  toolCallId: Schema.String,
  toolName: Schema.String,
  isError: Schema.Boolean,
  content: Schema.Array(Schema.Unknown),
})
const AssistantMessage = Schema.Struct({ role: Schema.Literal("assistant"), content: Schema.Array(Schema.Unknown) })
const ResponseEnd = Schema.Struct({ role: Schema.Literal("assistant"), stopReason: Schema.String })
const decodeResponseEnd = Schema.decodeUnknownOption(ResponseEnd)
const PythonCall = Schema.Struct({ type: Schema.Literal("toolCall"), id: Schema.String, name: Schema.Literals(["ipython", "python"]), arguments: Schema.Struct({ code: Schema.String }) })
const decodeAssistant = Schema.decodeUnknownOption(AssistantMessage)
const decodePython = Schema.decodeUnknownOption(PythonCall)
const TextPart = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })
const decodeResult = Schema.decodeUnknownOption(ToolResult)
const decodeText = Schema.decodeUnknownOption(TextPart)

/** Safe presentation of an authoritative tool result; excludes reasoning and exposes only validated Python source. */
type ConversationToolResult = Readonly<{ id: string; name: string; failed: boolean; pending: boolean; text: string; code?: string }>

/** Projects supported runtime details without making task-level success or ownership claims. */
export function describeConversationActivity(snapshot: PrimeSessionSnapshot) {
  const { session, useful, transport } = snapshot
  const state = useful.state
  const action = state.sessionActions.active
  const results: ConversationToolResult[] = []
  const runs = new Map<string, ConversationToolResult>()
  for (const message of [...useful.structuredMessages, useful.streamingMessage]) {
    const assistant = Option.getOrUndefined(decodeAssistant(message))
    for (const part of assistant?.content ?? []) {
      const call = Option.getOrUndefined(decodePython(part))
      if (call && !runs.has(call.id)) runs.set(call.id, { id: call.id, name: call.name, code: call.arguments.code, text: "", failed: false, pending: true })
    }
    const parsed = Option.getOrUndefined(decodeResult(message))
    if (!parsed) continue
    const text = parsed.content.flatMap((part) => {
      const decoded = Option.getOrUndefined(decodeText(part))
      return decoded ? [decoded.text] : []
    }).join("\n")
    runs.set(parsed.toolCallId, { id: parsed.toolCallId, name: parsed.toolName, failed: parsed.isError, pending: false, text, code: runs.get(parsed.toolCallId)?.code })
  }
  results.push(...runs.values())
  // Only the last finalized message can establish completion; a newer user/tool
  // message invalidates an older response's stop reason.
  const lastMessage = useful.structuredMessages.at(-1)
  const ending = Option.getOrUndefined(decodeResponseEnd(lastMessage))?.stopReason
  const settled = !useful.streamingMessage && !state.isStreaming && !state.sessionActions.active && state.sessionActions.queuedCount === 0
  const responseStatus = !settled ? undefined : ending === "stop" ? "Response complete" : ending === "aborted" ? "Stopped" : ending === "error" ? "Response failed" : ending === "length" ? "Response limit reached" : undefined
  const active = session.state === "working"
  const summary = transport.status !== "connected" ? "Activity unavailable while disconnected"
    : session.state === "recovering" ? "Restoring this conversation…"
    : session.workerFailed ? "A worker reported a failure"
    : active ? session.activitySummary || action?.label || (state.activeToolNames.length ? `Using ${state.activeToolNames.join(", ")}` : "Working…")
    : results.length ? "Execution details" : undefined
  return {
    summary,
    responseStatus,
    active: active && transport.status === "connected",
    phase: active ? action?.phase : undefined,
    tools: active ? state.activeToolNames : [],
    queued: state.sessionActions.queuedCount,
    followUps: state.sessionActions.followUps,
    results,
    children: useful.children,
  }
}
