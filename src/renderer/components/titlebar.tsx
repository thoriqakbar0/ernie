import * as stylex from "@stylexjs/stylex"
import { styles } from "./titlebar.stylex"
/** Renders the native draggable region at the top of the window. */
export function Titlebar() {
  return (
    <div {...stylex.props(styles.appTitlebar, styles.h38px, styles.shrink0, styles.borderB, styles.borderZinc200, styles.bgZinc50, styles.darkBorderZinc800, styles.darkBgZinc950)} />
  )
}
