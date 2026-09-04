import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"
const loadingRule = stylex.keyframes({
  "0%": {
    transform: "scaleX(0.55)",
    opacity: "0.4",
  },
  "100%": {
    transform: "scaleX(0.55)",
    opacity: "0.4",
  },
  "50%": {
    transform: "scaleX(1)",
    opacity: "1",
  },
})
/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  workspaceLoading: {
    display: "flex",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: "14px",
    color: theme["--muted"],
    fontSize: "12px",
  },
  workspaceLoadingRule: {
    width: "48px",
    height: "1px",
    backgroundColor: theme["--rule"],
    animationName: loadingRule,
    animationDuration: "1.4s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
})
