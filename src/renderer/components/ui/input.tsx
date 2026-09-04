import type { ComponentProps } from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import * as stylex from "@stylexjs/stylex"
import { controlStyles, type StyledProps } from "./styles"
const styles = stylex.create({
  input: {
    height: 32,
    width: "100%",
    minWidth: 0,
    paddingInline: 10,
    paddingBlock: 4,
    fontSize: {
      default: 16,
      "@media (min-width: 768px)": 14,
    },
    "::placeholder": {
      color: "var(--muted)",
    },
    "::file-selector-button": {
      display: "inline-flex",
      height: 24,
      borderWidth: 0,
      backgroundColor: "transparent",
      color: "var(--ink)",
      fontSize: 14,
      fontWeight: 500,
    },
  },
})
/** Base UI input with the shared focus and validation states. */
export function Input({ xstyle, ...props }: StyledProps<ComponentProps<"input">>) {
  return (
    <InputPrimitive
      data-slot="input"
      {...props}
      {...stylex.props(controlStyles.control, styles.input, xstyle)}
    />
  )
}
