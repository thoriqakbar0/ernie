import * as stylex from "@stylexjs/stylex"
import { theme } from "./theme.stylex"

/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  controlIcon: {
    width: "16px",
    height: "16px",
    flex: "0 0 auto",
  },
  primeComposer: {
    width: "min(100%, 720px)",
    margin: "0 auto",
    pointerEvents: "auto",
  },
  primeComposerHero: {
    width: "min(100%, 719px)",
  },
  composerGroup: {
    borderRadius: 20,
    borderColor: { default: theme["--rule"], ':has([data-slot="input-group-control"]:focus-visible)': theme["--focus"] },
    backgroundColor: theme["--surface"],
    opacity: { default: 1, ":has(:disabled)": 1 },
  },
  composerActions: { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" },
  composerDefault: { color: theme["--muted"], fontSize: 12 },
  composerFeedback: { minHeight: 22, padding: "6px 12px 0", color: theme["--muted"], fontSize: 12, lineHeight: 1.5 },
  composerError: { color: theme["--danger"] },
  srOnly: {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: "0",
    borderStyle: "solid",
  },
  composerControl: {
    boxShadow: {
      default: null,
      ":focus": "none",
      ":focus-visible": "none",
    },
    outlineStyle: {
      default: null,
      ":focus": "none",
      ":focus-visible": "none",
    },
  },
  composerField: {
    minHeight: 56,
    padding: "14px 16px",
    maxHeight: 160,
    overflowY: "auto",
  },
  composerAction: {
    borderRadius: 999,
  },
})
