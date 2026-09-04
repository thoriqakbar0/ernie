import type { ComponentProps } from "react"
import * as stylex from "@stylexjs/stylex"
import { controlStyles, type StyledProps } from "./styles"
const styles = stylex.create({
  textarea: {
    display: "flex",
    fieldSizing: "content",
    minHeight: 64,
    width: "100%",
    paddingInline: 10,
    paddingBlock: 8,
    fontSize: {
      default: 16,
      "@media (min-width: 768px)": 14,
    },
    "::placeholder": {
      color: "var(--muted)",
    },
  },
})
/** Content-sized textarea with the shared focus and validation states. */
export function Textarea({ xstyle, ...props }: StyledProps<ComponentProps<"textarea">>) {
  return (
    <textarea
      data-slot="textarea"
      {...props}
      {...stylex.props(controlStyles.control, styles.textarea, xstyle)}
    />
  )
}
