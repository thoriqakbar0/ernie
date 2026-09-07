import type { ComponentProps } from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import * as stylex from "@stylexjs/stylex"
import { controlStyles } from "./styles"
import type { StyledProps } from "./styles"

const styles = stylex.create({
  input: {
    "::file-selector-button": {
      backgroundColor: "transparent",
      borderWidth: 0,
      color: "var(--ink)",
      display: "inline-flex",
      fontSize: 14,
      fontWeight: 500,
      height: 24,
    },
    "::placeholder": {
      color: "var(--muted)",
    },
    fontSize: {
      "@media (min-width: 768px)": 14,
      default: 16,
    },
    height: 32,
    minWidth: 0,
    paddingBlock: 4,
    paddingInline: 10,
    width: "100%",
  },
})
/** Base UI input with the shared focus and validation states. */
export const Input = ({ xstyle, ...props }: StyledProps<ComponentProps<"input">>) => (
  <InputPrimitive
    data-slot="input"
    {...props}
    {...stylex.props(controlStyles.control, styles.input, xstyle)}
  />
)
