import * as stylex from "@stylexjs/stylex"

/** Shared empty-session and active-session composer sizing. */
export const styles = stylex.create({
  prompt: { minHeight: 40, maxHeight: 160, overflowY: "auto" },
  action: { marginLeft: "auto" },
})
