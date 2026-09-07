import { Button as ButtonPrimitive } from "@base-ui/react/button"
import * as stylex from "@stylexjs/stylex"
import { controlStyles } from "./styles"
import type { StyledProps } from "./styles"

const styles = stylex.create({
  bordered: {
    backgroundColor: {
      ":hover": {
        "@media (prefers-color-scheme: dark)": "color-mix(in srgb, var(--rule) 50%, transparent)",
        default: "var(--surface-muted)",
      },
      ':is([aria-expanded="true"])': "var(--surface-muted)",
      "@media (prefers-color-scheme: dark)": "color-mix(in srgb, var(--rule) 30%, transparent)",
      default: "var(--surface)",
    },
    borderColor: {
      ":focus-visible": "var(--focus)",
      ':is([aria-invalid="true"])': "var(--danger)",
      default: "var(--rule)",
    },
    color: "var(--ink)",
  },
  default: {
    backgroundColor: {
      ":hover:not(:disabled)": "var(--accent-hover)",
      default: "var(--accent)",
    },
    color: "var(--on-accent)",
  },
  destructive: {
    backgroundColor: {
      ":hover": {
        "@media (prefers-color-scheme: dark)": "color-mix(in srgb, var(--danger) 30%, transparent)",
        default: "color-mix(in srgb, var(--danger) 20%, transparent)",
      },
      "@media (prefers-color-scheme: dark)": "color-mix(in srgb, var(--danger) 20%, transparent)",
      default: "color-mix(in srgb, var(--danger) 10%, transparent)",
    },
    borderColor: {
      ":focus-visible": "color-mix(in srgb, var(--danger) 40%, transparent)",
      ':is([aria-invalid="true"])': "var(--danger)",
      default: "transparent",
    },
    boxShadow: {
      ":focus-visible": {
        "@media (prefers-color-scheme: dark)":
          "0 0 0 3px color-mix(in srgb, var(--danger) 40%, transparent)",
        default: "0 0 0 3px color-mix(in srgb, var(--danger) 20%, transparent)",
      },
      default: "none",
    },
    color: "var(--danger)",
  },
  ghost: {
    backgroundColor: {
      ":hover": {
        "@media (prefers-color-scheme: dark)":
          "color-mix(in srgb, var(--surface-muted) 50%, transparent)",
        default: "var(--surface-muted)",
      },
      ':is([aria-expanded="true"])': "var(--surface-muted)",
      default: "transparent",
    },
    color: "var(--ink)",
  },
  link: {
    color: "var(--accent)",
    textDecorationLine: {
      ":hover": "underline",
      default: "none",
    },
    textUnderlineOffset: 4,
  },
  root: {
    alignItems: "center",
    backgroundClip: "padding-box",
    backgroundColor: "transparent",
    borderColor: {
      ":focus-visible": "var(--focus)",
      ':is([aria-invalid="true"])': "var(--danger)",
      default: "transparent",
    },
    display: "inline-flex",
    flexShrink: 0,
    fontWeight: 500,
    justifyContent: "center",
    pointerEvents: {
      ":disabled": "none",
      default: "auto",
    },
    transform: {
      ":active:not([aria-haspopup])": "translateY(1px)",
      default: "none",
    },
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  secondary: {
    backgroundColor: {
      ":hover": "color-mix(in oklch, var(--surface-muted), var(--ink) 5%)",
      default: "var(--surface-muted)",
    },
    color: "var(--ink)",
  },
})
const sizes = stylex.create({
  default: {
    gap: 6,
    height: 32,
    paddingInline: 10,
  },
  icon: {
    height: 32,
    padding: 0,
    width: 32,
  },
  "icon-lg": {
    height: 36,
    padding: 0,
    width: 36,
  },
  "icon-sm": {
    height: 28,
    padding: 0,
    width: 28,
  },
  "icon-xs": {
    height: 24,
    padding: 0,
    width: 24,
  },
  lg: {
    gap: 6,
    height: 36,
    paddingInline: 10,
  },
  sm: {
    fontSize: "0.8rem",
    gap: 4,
    height: 28,
    paddingInline: 10,
  },
  xs: {
    fontSize: 12,
    gap: 4,
    height: 24,
    paddingInline: 8,
  },
})

/** Accessible Base UI button with typed appearance and size variants. */
export const Button = ({
  xstyle,
  variant = "default",
  size = "default",
  ...props
}: StyledProps<ButtonPrimitive.Props> & {
  variant?: "default" | "bordered" | "secondary" | "ghost" | "destructive" | "link"
  size?: keyof typeof sizes
}) => (
  <ButtonPrimitive
    data-slot="button"
    {...props}
    {...stylex.props(controlStyles.control, styles.root, styles[variant], sizes[size], xstyle)}
  />
)
