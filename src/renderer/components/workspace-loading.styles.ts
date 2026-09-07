import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

const loadingRule = stylex.keyframes({
  "0%": {
    opacity: "0.4",
    transform: "scaleX(0.55)",
  },
  "100%": {
    opacity: "0.4",
    transform: "scaleX(0.55)",
  },
  "50%": {
    opacity: "1",
    transform: "scaleX(1)",
  },
})
/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  workspaceLoading: {
    alignItems: "center",
    color: theme["--muted"],
    display: "flex",
    fontSize: "12px",
    gap: "14px",
    height: "100%",
    justifyContent: "center",
  },
  workspaceLoadingRule: {
    animationDuration: "1.4s",
    animationIterationCount: "infinite",
    animationName: loadingRule,
    animationTimingFunction: "ease-in-out",
    backgroundColor: theme["--rule"],
    height: "1px",
    width: "48px",
  },
})
