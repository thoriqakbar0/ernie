import * as stylex from "@stylexjs/stylex"
import { theme } from "./theme.stylex"

/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  composerAction: {
    backgroundColor: { ":disabled": theme["--surface-strong"], default: theme["--accent"] },
    borderRadius: 999,
    color: { ":disabled": theme["--faint"], default: theme["--on-accent"] },
    opacity: { ":disabled": 1, default: 1 },
  },
  composerActions: { alignItems: "center", display: "flex", gap: 8, marginLeft: "auto" },
  composerControl: {
    boxShadow: {
      ":focus": "none",
      ":focus-visible": "none",
      default: null,
    },
    outlineStyle: {
      ":focus": "none",
      ":focus-visible": "none",
      default: null,
    },
  },
  composerDefault: { color: theme["--muted"], fontSize: 12 },
  composerError: { color: theme["--danger"] },
  composerFeedback: {
    color: theme["--muted"],
    fontSize: 12,
    lineHeight: 1.5,
    minHeight: { ":empty": 0, default: 22 },
    padding: { ":empty": 0, default: "6px 12px 0" },
  },
  composerField: {
    fontSize: 16,
    lineHeight: 1.5,
    maxHeight: 160,
    minHeight: 56,
    overflowY: "auto",
    padding: "16px 18px",
  },
  composerGroup: {
    backgroundColor: theme["--surface"],
    borderColor: {
      ':has([data-slot="input-group-control"]:focus-visible)': theme["--focus"],
      default: theme["--rule"],
    },
    borderRadius: 20,
    boxShadow: {
      ':has([data-slot="input-group-control"]:focus-visible)': "none",
      default: "none",
    },
    opacity: { ":has(:disabled)": 1, default: 1 },
  },
  composerToolbar: { marginTop: 7 },
  controlIcon: {
    flex: "0 0 auto",
    height: "16px",
    width: "16px",
  },
  primeComposer: {
    margin: "0 auto",
    pointerEvents: "auto",
    position: "relative",
    width: "min(100%, 720px)",
  },
  primeComposerHero: {
    width: "min(100%, 720px)",
  },
  srOnly: {
    borderStyle: "solid",
    borderWidth: "0",
    clip: "rect(0, 0, 0, 0)",
    height: "1px",
    margin: "-1px",
    overflow: "hidden",
    padding: "0",
    position: "absolute",
    whiteSpace: "nowrap",
    width: "1px",
  },
})
