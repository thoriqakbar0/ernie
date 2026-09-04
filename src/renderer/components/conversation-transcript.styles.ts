import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"
const transcriptScrollShimmer = stylex.keyframes({
  to: {
    transform: "translateX(100%)",
  },
})

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
    gap: "30px",
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
    fontSize: "11px",
    fontWeight: "680",
  },
  messageParagraph: {
    margin: "0",
  },
  messageEntryContent: {
    maxWidth: "66ch",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    color: theme["--ink-strong"],
    fontSize: "16px",
    lineHeight: "1.62",
  },
  userMessageContent: {
    width: "fit-content",
    maxWidth: "min(58ch, 86%)",
    borderRadius: "16px 16px 4px",
    backgroundColor: theme["--surface-muted"],
    padding: "10px 14px",
  },
  systemMessageContent: {
    color: theme["--muted"],
    fontSize: "13px",
  },
  conversationScrollShimmer: {
    position: "absolute",
    bottom: "0",
    insetInline: "0",
    height: "28px",
    overflow: "hidden",
    backgroundImage: "linear-gradient(to bottom, transparent, var(--surface))",
    pointerEvents: "none",
    "::after": {
      position: "absolute",
      bottom: "0",
      insetInline: "0",
      height: "2px",
      backgroundImage: "linear-gradient(90deg, transparent, var(--accent), transparent)",
      content: '""',
      opacity: "0.55",
      transform: "translateX(-100%)",
      animationName: transcriptScrollShimmer,
      animationDuration: "1.8s",
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
    },
  },
})
