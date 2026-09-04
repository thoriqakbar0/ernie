import { styles as sharedStyles } from "../component-styles"
import * as stylex from "@stylexjs/stylex"
/** Decorative plus mark. The enclosing control must provide its accessible name. */
export function PlusIcon({ xstyle }: { xstyle?: stylex.StyleXStyles }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 16 16"
      {...stylex.props(sharedStyles.controlIcon, xstyle)}
    >
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  )
}
