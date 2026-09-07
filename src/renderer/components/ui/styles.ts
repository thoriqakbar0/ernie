import * as stylex from "@stylexjs/stylex"

/** First-party overrides merge after each component's default styles. */
export type StyledProps<Props> = Omit<Props, "className" | "style"> & {
  xstyle?: stylex.StyleXStyles
}

/** Shared control states keep keyboard focus and validation visible. */
export const controlStyles = stylex.create({
  control: {
    backgroundColor: {
      ":disabled": {
        "@media (prefers-color-scheme: dark)": "color-mix(in srgb, var(--rule) 80%, transparent)",
        default: "color-mix(in srgb, var(--rule) 50%, transparent)",
      },
      "@media (prefers-color-scheme: dark)": "color-mix(in srgb, var(--rule) 30%, transparent)",
      default: "transparent",
    },
    borderColor: {
      ":focus-visible": "var(--focus)",
      ':is([aria-invalid="true"])': "var(--danger)",
      default: "var(--rule)",
    },
    borderRadius: 8,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: {
      ':is([aria-invalid="true"])': "0 0 0 3px color-mix(in srgb, var(--danger) 20%, transparent)",
      default: "none",
    },
    color: "var(--ink)",
    cursor: {
      ":disabled": "not-allowed",
      default: null,
    },
    fontSize: 14,
    opacity: {
      ":disabled": 0.5,
      default: 1,
    },
    outlineStyle: "none",
    transition: "color 150ms, background-color 150ms, border-color 150ms, box-shadow 150ms",
  },
  hidden: {
    borderWidth: 0,
    clipPath: "inset(50%)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
  icon: {
    flexShrink: 0,
    height: 16,
    pointerEvents: "none",
    width: 16,
  },
})
