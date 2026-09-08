import type { PrimeSessionSnapshot, PrimeStructuredMessage } from "../packages/prime-agent"
import { describeConversationToolResults } from "./conversation-activity"

/** Groups native tool history at user-message boundaries; readable message ids retain projection identity. */
export const conversationTurns = (snapshot: PrimeSessionSnapshot) => {
  const raw = snapshot.useful.structuredMessages
  const starts = raw.flatMap((message, index) => (message.role === "user" ? [index] : []))
  if (!starts.length || starts[0] !== 0) starts.unshift(0)
  const idOf = (message: PrimeStructuredMessage, index: number) =>
    typeof message.id === "string" && message.id.length
      ? message.id
      : `${snapshot.session.id}:${message.role}:${typeof message.timestamp === "number" ? message.timestamp : "unknown"}:${index}`
  return starts
    .map((start, turnIndex) => {
      const end = starts[turnIndex + 1] ?? raw.length
      const latest = turnIndex === starts.length - 1
      const messages = raw.slice(start, end)
      const streaming = latest ? snapshot.useful.streamingMessage : undefined
      const runs = describeConversationToolResults(messages, streaming)
      const last = messages.at(-1)
      const active = latest && (snapshot.session.state === "working" || Boolean(streaming))
      const finalIndex = messages.findLastIndex(
        (message) =>
          message.role === "assistant" && ["stop", "length"].includes(String(message.stopReason)),
      )
      const final = finalIndex >= 0 ? messages[finalIndex] : undefined
      const beforeId =
        !active && final
          ? idOf(final, start + finalIndex)
          : !latest && raw[end]
            ? idOf(raw[end], end)
            : undefined
      return {
        id: raw[start] ? idOf(raw[start], start) : `${snapshot.session.id}:initial`,
        beforeId,
        runs,
        active,
        status: active
          ? "Working…"
          : last?.stopReason === "aborted"
            ? "Stopped"
            : last?.stopReason === "error"
              ? "Response failed"
              : last?.stopReason === "stop"
                ? "Response finished"
                : "Execution details",
      }
    })
    .filter(
      (turn) =>
        turn.runs.length > 0 ||
        turn.active ||
        turn.status === "Stopped" ||
        turn.status === "Response failed",
    )
}
