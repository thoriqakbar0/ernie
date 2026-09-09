import type { ComponentProps } from "react"
import * as stylex from "@stylexjs/stylex"
import { controlStyles } from "./styles"
import type { StyledProps } from "./styles"

const styles = stylex.create({
  textarea: {
    "::placeholder": {
      color: "var(--muted)",
    },
    display: "flex",
    fieldSizing: "content",
    fontSize: {
      "@media (min-width: 768px)": 14,
      default: 16,
    },
    minHeight: 64,
    paddingBlock: 8,
    paddingInline: 10,
    width: "100%",
  },
})
/** Content-sized textarea with the shared focus and validation states. */
export const Textarea = ({ xstyle, ...props }: StyledProps<ComponentProps<"textarea">>) => (
  <textarea
    data-slot="textarea"
    {...props}
    {...stylex.props(controlStyles.control, styles.textarea, xstyle)}
  />
)
