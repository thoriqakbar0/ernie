import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

/** Compact update status stays outside the transcript and composer. */
export const styles = stylex.create({
  notice: {
    alignItems: "center",
    backgroundColor: theme["--surface-muted"],
    color: theme["--ink"],
    display: "flex",
    flexShrink: "0",
    flexWrap: "wrap",
    fontSize: "12px",
    gap: "8px",
    justifyContent: "space-between",
    padding: "6px 12px",
  },
})
