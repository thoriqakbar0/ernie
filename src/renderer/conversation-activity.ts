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
const PythonCall = Schema.Struct({ type: Schema.Literal("toolCall"), id: Schema.String, name: Schema.Literals(["ipython", "python"]), arguments: Schema.Struct({ code: Schema.String }) })
const decodeAssistant = Schema.decodeUnknownOption(AssistantMessage)
const decodePython = Schema.decodeUnknownOption(PythonCall)
const TextPart = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })
const decodeResult = Schema.decodeUnknownOption(ToolResult)
const decodeText = Schema.decodeUnknownOption(TextPart)

/** Safe presentation of an authoritative tool result; excludes reasoning and exposes only validated Python source. */
export type ConversationToolResult = Readonly<{ id: string; name: string; failed: boolean; text: string; code?: string }>

/** Projects supported runtime details without making task-level success or ownership claims. */
export function describeConversationActivity(snapshot: PrimeSessionSnapshot) {
  const { session, useful, transport } = snapshot
  const state = useful.state
  const action = state.sessionActions.active
  const results: ConversationToolResult[] = []
  const pythonSources = new Map<string, string>()
  for (const message of useful.structuredMessages) {
    const assistant = Option.getOrUndefined(decodeAssistant(message))
    for (const part of assistant?.content ?? []) {
      const call = Option.getOrUndefined(decodePython(part))
      if (call) pythonSources.set(call.id, call.arguments.code)
    }
  }
  for (const message of useful.structuredMessages) {
    const parsed = Option.getOrUndefined(decodeResult(message))
    if (!parsed) continue
    const text = parsed.content.flatMap((part) => {
      const decoded = Option.getOrUndefined(decodeText(part))
      return decoded ? [decoded.text] : []
    }).join("\n")
    results.push({ id: parsed.toolCallId, name: parsed.toolName, failed: parsed.isError, text, code: pythonSources.get(parsed.toolCallId) })
  }
  const active = session.state === "working"
  const summary = transport.status !== "connected" ? "Activity unavailable while disconnected"
    : session.state === "recovering" ? "Restoring this conversation…"
    : session.workerFailed ? "A worker reported a failure"
    : active ? session.activitySummary || action?.label || (state.activeToolNames.length ? `Using ${state.activeToolNames.join(", ")}` : "Working…")
    : results.length ? "Execution details" : undefined
  return {
    summary,
    active: active && transport.status === "connected",
    phase: active ? action?.phase : undefined,
    tools: active ? state.activeToolNames : [],
    queued: state.sessionActions.queuedCount,
    followUps: state.sessionActions.followUps,
    results,
    children: useful.children,
  }
}
