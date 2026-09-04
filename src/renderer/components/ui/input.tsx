import * as React from "react"
import * as stylex from "@stylexjs/stylex"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { styles } from "./field.stylex"

/** Text input with native attributes and composable field styles. */
function Input({
  className,
  type,
  xstyle,
  style,
  ...props
}: React.ComponentProps<"input"> & { xstyle?: stylex.StyleXStyles }) {
  const compiled = stylex.props(styles.field, styles.input, xstyle)
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={[compiled.className, className].filter(Boolean).join(" ")}
      style={{ ...compiled.style, ...style }}
      {...props}
    />
  )
}
export { Input }
