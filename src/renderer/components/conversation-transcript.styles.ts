import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"
/** Component-owned layout, responsive variants, and interaction states. */
/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  conversationTranscriptShell: {
    position: "relative",
    minHeight: "0",
    flex: "1",
  },
  conversationTranscript: {
    height: "100%",
    overflowY: "auto",
    scrollPaddingBottom: "32px",
  },
  conversationTranscriptInner: {
    display: "flex",
    width: "min(100%, 720px)",
    margin: "0 auto",
    flexDirection: "column",
    gap: "20px",
    padding: "38px 28px 48px",
    paddingInline: {
      default: null,
      "@media (max-width: 720px)": "18px",
    },
  },
  messageEntry: {
    display: "flex",
    minWidth: "0",
    flexDirection: "column",
    alignItems: "flex-start",
  },
  messageEntryUser: {
    alignItems: "flex-end",
  },
  messageEntryHeader: {
    marginBottom: "7px",
  },
  messageEntryRole: {
    color: theme["--muted"],
    fontSize: "12px",
    fontWeight: "680",
  },
  inlineCode: { fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: ".875em", backgroundColor: theme["--surface-muted"], borderRadius: 4, padding: "2px 4px", boxDecorationBreak: "clone" },
  messageParagraph: {
    margin: "0",
  },
  messageEntryContent: {
    display: "grid",
    gap: "12px",
    maxWidth: "66ch",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    color: theme["--ink-strong"],
    fontSize: { default: "15px", "@media (max-width: 720px)": "16px" },
    fontWeight: 400,
    lineHeight: 1.6,
  },
  userMessageContent: {
    width: "fit-content",
    maxWidth: "min(64ch, 90%)",
    borderRadius: "16px 16px 4px",
    backgroundColor: theme["--surface-muted"],
    padding: "10px 14px",
  },
  systemMessageContent: {
    color: theme["--muted"],
    fontSize: "13px",
  },
})
