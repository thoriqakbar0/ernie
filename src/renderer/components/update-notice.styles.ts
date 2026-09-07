import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

/** Compact update status stays outside the transcript and composer. */
export const styles = stylex.create({
  notice: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "6px 12px", fontSize: "12px", color: theme["--ink"], backgroundColor: theme["--surface-muted"], flexShrink: "0" },
})
