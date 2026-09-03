import * as stylex from "@stylexjs/stylex"

/** Styles owned by the app component. */
export const styles = stylex.create({
  appColumns: {"gridTemplateColumns":"236px minmax(0,1fr)"},
  bgZinc50: {"backgroundColor":"#fafafa"},
  darkBgZinc950: {"@media (prefers-color-scheme: dark)":{"backgroundColor":"#09090b"}},
  darkTextZinc50: {"@media (prefers-color-scheme: dark)":{"color":"#fafafa"}},
  flex: {"display":"flex"},
  flex1: {"flex":1},
  flexCol: {"flexDirection":"column"},
  grid: {"display":"grid"},
  hFull: {"height":"100%"},
  minH0: {"minHeight":0},
  minHScreen: {"minHeight":"100vh"},
  textZinc950: {"color":"#09090b"},
  wFull: {"width":"100%"},
})
