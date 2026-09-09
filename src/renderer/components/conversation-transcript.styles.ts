import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"
/** Component-owned layout, responsive variants, and interaction states. */
/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  conversationTranscript: {
    height: "100%",
    overflowY: "auto",
    scrollPaddingBottom: "32px",
  },
  conversationTranscriptInner: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--transcript-gap, 20px)",
    margin: "0 auto",
    padding: "38px 28px 48px",
    paddingInline: {
      "@media (max-width: 720px)": "18px",
      default: null,
    },
    width: "min(100%, var(--transcript-width, 720px))",
  },
  conversationTranscriptShell: {
    flex: "1",
    minHeight: "0",
    position: "relative",
  },
  inlineCode: {
    backgroundColor: theme["--surface-muted"],
    borderRadius: 4,
    boxDecorationBreak: "clone",
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    fontSize: ".875em",
    padding: "2px 4px",
  },
  messageEntry: {
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "column",
    minWidth: "0",
  },
  messageEntryContent: {
    color: theme["--ink-strong"],
    display: "grid",
    fontSize: { "@media (max-width: 720px)": "16px", default: "15px" },
    fontWeight: 400,
    gap: "12px",
    lineHeight: 1.6,
    maxWidth: "min(100%, var(--transcript-width, 66ch))",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  messageEntryHeader: {
    marginBottom: "7px",
  },
  messageEntryRole: {
    color: theme["--muted"],
    fontSize: "12px",
    fontWeight: "680",
  },
  messageEntryUser: {
    alignItems: "flex-end",
  },
  messageParagraph: {
    margin: "0",
  },
  participantHeader: {
    alignItems: "center",
    color: theme["--ink"],
    display: "flex",
    fontSize: 13,
    fontWeight: 500,
    gap: 8,
    marginBlockEnd: 8,
  },
  systemMessageContent: {
    color: theme["--muted"],
    fontSize: "13px",
  },
  userMessageContent: {
    backgroundColor: theme["--surface-muted"],
    borderRadius: "16px 16px 4px",
    maxWidth: "min(64ch, 90%)",
    padding: "10px 14px",
    width: "fit-content",
  },
})
