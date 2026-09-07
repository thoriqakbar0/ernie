import * as stylex from "@stylexjs/stylex"
import icon from "../icon.png"

/** Renders the shared production mark beside the visible Ernie name. */
export function ErnieMark({ xstyle }: Readonly<{ xstyle?: stylex.StyleXStyles }>) {
  return <img {...stylex.props(xstyle)} src={icon} alt="" aria-hidden="true" width={48} height={48} />
}
