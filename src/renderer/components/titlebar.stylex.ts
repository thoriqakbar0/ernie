import * as stylex from "@stylexjs/stylex"

/** Styles owned by the titlebar component. */
export const styles = stylex.create({
  appTitlebar: {"WebkitAppRegion":"drag"},
  bgZinc50: {"backgroundColor":"#fafafa"},
  borderB: {"borderBottomWidth":1,"borderBottomStyle":"solid"},
  borderZinc200: {"borderColor":"#e4e4e7"},
  darkBgZinc950: {"@media (prefers-color-scheme: dark)":{"backgroundColor":"#09090b"}},
  darkBorderZinc800: {"@media (prefers-color-scheme: dark)":{"borderColor":"#27272a"}},
  h38px: {"height":"38px"},
  shrink0: {"flexShrink":0},
})
