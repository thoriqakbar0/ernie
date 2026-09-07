import * as stylex from "@stylexjs/stylex"
import { useNativeInspection } from "../prime-agent-state"
import { ConversationMessages } from "./conversation-messages"
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
          <p {...stylex.props(styles.feedback)}>
            {inspection.data.source === "saved"
              ? "Saved conversation · read only"
              : "Child conversation · read only"}
          </p>
          {inspection.data.messages.length ? (
            <ConversationMessages
              participantId={childId}
              sessionId={`inspection:${parentId}:${childId}`}
              agentName={inspection.data.name}
              messages={inspection.data.messages}
            />
          ) : (
            <p {...stylex.props(styles.feedback)}>No messages yet.</p>
          )}
        </>
      ) : null}
    </div>
  )
}
