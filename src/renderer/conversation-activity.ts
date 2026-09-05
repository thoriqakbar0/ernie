import { Option, Schema } from "effect"
import type { PrimeSessionSnapshot } from "../packages/prime-agent"

const ToolResult = Schema.Struct({
  role: Schema.Literal("toolResult"),
  toolCallId: Schema.String,
  toolName: Schema.String,
  isError: Schema.Boolean,
  content: Schema.Array(Schema.Unknown),
})
const TextPart = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })
const decodeResult = Schema.decodeUnknownOption(ToolResult)
const decodeText = Schema.decodeUnknownOption(TextPart)

/** Safe presentation of an authoritative tool result; excludes reasoning and raw arguments. */
export type ConversationToolResult = Readonly<{ id: string; name: string; failed: boolean; text: string }>

/** Projects supported runtime details without making task-level success or ownership claims. */
export function describeConversationActivity(snapshot: PrimeSessionSnapshot) {
  const { session, useful, transport } = snapshot
  const state = useful.state
  const action = state.sessionActions.active
  const results: ConversationToolResult[] = []
  for (const message of useful.structuredMessages) {
    const parsed = Option.getOrUndefined(decodeResult(message))
    if (!parsed) continue
    const text = parsed.content.flatMap((part) => {
      const decoded = Option.getOrUndefined(decodeText(part))
      return decoded ? [decoded.text] : []
    }).join("\n")
    results.push({ id: parsed.toolCallId, name: parsed.toolName, failed: parsed.isError, text })
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
