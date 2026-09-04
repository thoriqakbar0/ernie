import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

/** Styles owned by this surface, including its responsive and interaction states. */
export const styles = stylex.create({
  emptyState: {
    display: "flex",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    padding: "42px 24px",
    textAlign: "center",
  },
  emptyStateComposerShell: {
    margin: "0",
    textAlign: "left",
  },
  emptyStateStatus: {
    marginTop: "12px",
    color: theme["--muted"],
    fontSize: "11px",
  },
  inlineError: {
    maxWidth: "54ch",
    marginTop: "12px",
    color: theme["--danger"],
    fontSize: "12px",
  },
})
