import * as stylex from "@stylexjs/stylex"

/** First-party overrides merge after each component's default styles. */
export type StyledProps<Props> = Omit<Props, "className" | "style"> & {
  xstyle?: stylex.StyleXStyles
}

/** Shared control states keep keyboard focus and validation visible. */
export const controlStyles = stylex.create({
  control: {
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: {
      default: "var(--rule)",
      ":focus-visible": "var(--focus)",
      ':is([aria-invalid="true"])': "var(--danger)",
    },
    borderRadius: 8,
    backgroundColor: {
      default: "transparent",
      "@media (prefers-color-scheme: dark)": "color-mix(in srgb, var(--rule) 30%, transparent)",
      ":disabled": {
        default: "color-mix(in srgb, var(--rule) 50%, transparent)",
        "@media (prefers-color-scheme: dark)": "color-mix(in srgb, var(--rule) 80%, transparent)",
      },
    },
    color: "var(--ink)",
    fontSize: 14,
    outlineStyle: "none",
    boxShadow: {
      default: "none",
      ":focus-visible": "0 0 0 3px color-mix(in srgb, var(--focus) 50%, transparent)",
      ':is([aria-invalid="true"])': "0 0 0 3px color-mix(in srgb, var(--danger) 20%, transparent)",
    },
    transition: "color 150ms, background-color 150ms, border-color 150ms, box-shadow 150ms",
    opacity: {
      default: 1,
      ":disabled": 0.5,
    },
    cursor: {
      default: null,
      ":disabled": "not-allowed",
    },
  },
  icon: {
    width: 16,
    height: 16,
    flexShrink: 0,
    pointerEvents: "none",
  },
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
})
