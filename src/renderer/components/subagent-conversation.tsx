import * as stylex from "@stylexjs/stylex"
import { ConversationTranscript } from "./conversation-transcript"
import { useNativeInspection, usePrimeSessionSnapshot } from "../prime-agent-state"
import { theme } from "../theme.stylex"

const styles = stylex.create({
  body: { display: "flex", flex: 1, flexDirection: "column", minHeight: 0, minWidth: 0 },
  feedback: { color: theme["--muted"], fontSize: 13, lineHeight: 1.5, padding: 20 },
  retry: {
    color: theme["--ink"],
    cursor: "pointer",
    minHeight: 40,
    textDecorationLine: "underline",
  },
})

/** Reads one child only while its thread is open, without switching the parent session. */
export const SubagentConversation = ({
  parentId,
  childId,
}: {
  parentId: string
  childId: string
}) => {
  const inspection = useNativeInspection(parentId, { id: childId, kind: "child" })
  const live = usePrimeSessionSnapshot(
    inspection.data?.source === "live" ? inspection.data.sessionId : undefined,
  )
  const snapshot = live.data ?? inspection.data?.snapshot
  const messages = snapshot?.messages ?? inspection.data?.messages ?? []
  return (
    <div {...stylex.props(styles.body)}>
      {inspection.isPending ? (
        <p {...stylex.props(styles.feedback)}>
          <output>Loading conversation…</output>
        </p>
      ) : null}
      {inspection.error ? (
        <div {...stylex.props(styles.feedback)}>
          <p role="alert">
            This conversation could not be refreshed.{" "}
            {inspection.data
              ? "The last loaded messages are shown below."
              : "Try again to load its messages."}
          </p>
          <button
            type="button"
            {...stylex.props(styles.retry)}
            onClick={() => {
              void inspection.refetch()
            }}
          >
            Try again
          </button>
        </div>
      ) : null}
      {inspection.data ? (
        <>
          {inspection.data.source === "live" && snapshot?.transport.status !== "connected" ? (
            <p {...stylex.props(styles.feedback)}>Reconnecting to live conversation…</p>
          ) : null}
          {messages.length || snapshot ? (
            <ConversationTranscript
              participantId={childId}
              sessionId={`inspection:${parentId}:${childId}`}
              agentName={inspection.data.name}
              messages={messages}
              snapshot={snapshot}
            />
          ) : (
            <p {...stylex.props(styles.feedback)}>No messages yet.</p>
          )}
        </>
      ) : null}
    </div>
  )
}
