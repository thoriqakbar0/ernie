import * as React from "react"
import * as stylex from "@stylexjs/stylex"
import { styles } from "./field.stylex"

/** Content-sized textarea with native attributes and composable field styles. */
function Textarea({
  className,
  xstyle,
  style,
  ...props
}: React.ComponentProps<"textarea"> & { xstyle?: stylex.StyleXStyles }) {
  const compiled = stylex.props(styles.field, styles.textarea, xstyle)
  return (
    <textarea
      data-slot="textarea"
      className={[compiled.className, className].filter(Boolean).join(" ")}
      style={{ ...compiled.style, ...style }}
      {...props}
    />
  )
}
export { Textarea }
