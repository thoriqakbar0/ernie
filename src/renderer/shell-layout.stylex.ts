import * as stylex from "@stylexjs/stylex"

export const shellLayout = stylex.defineVars({ headerInset: "20px", headerTopInset: "0px" })

export const collapsedSidebarLayout = stylex.createTheme(shellLayout, {
  headerInset: "64px",
  headerTopInset: "32px",
})
