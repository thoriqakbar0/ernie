import { Button as ButtonPrimitive } from "@base-ui/react/button"
import * as stylex from "@stylexjs/stylex"
import { controlStyles, type StyledProps } from "./styles"
const styles = stylex.create({
  root: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderColor: {
      default: "transparent",
      ":focus-visible": "var(--focus)",
      ':is([aria-invalid="true"])': "var(--danger)",
    },
    backgroundColor: "transparent",
    backgroundClip: "padding-box",
    fontWeight: 500,
    whiteSpace: "nowrap",
    userSelect: "none",
    pointerEvents: {
      default: "auto",
      ":disabled": "none",
    },
    transform: {
      default: "none",
      ":active:not([aria-haspopup])": "translateY(1px)",
    },
  },
  default: {
    backgroundColor: {
      default: "var(--accent)",
      ":hover": "color-mix(in srgb, var(--accent) 80%, transparent)",
    },
    color: "var(--surface)",
  },
  bordered: {
    borderColor: {
      default: "var(--rule)",
      ":focus-visible": "var(--focus)",
      ':is([aria-invalid="true"])': "var(--danger)",
    },
    backgroundColor: {
      default: "var(--surface)",
      "@media (prefers-color-scheme: dark)": "color-mix(in srgb, var(--rule) 30%, transparent)",
      ":hover": {
        default: "var(--surface-muted)",
        "@media (prefers-color-scheme: dark)": "color-mix(in srgb, var(--rule) 50%, transparent)",
      },
      ':is([aria-expanded="true"])': "var(--surface-muted)",
    },
    color: "var(--ink)",
  },
  secondary: {
    backgroundColor: {
      default: "var(--surface-muted)",
      ":hover": "color-mix(in oklch, var(--surface-muted), var(--ink) 5%)",
    },
    color: "var(--ink)",
  },
  ghost: {
    backgroundColor: {
      default: "transparent",
      ":hover": {
        default: "var(--surface-muted)",
        "@media (prefers-color-scheme: dark)":
          "color-mix(in srgb, var(--surface-muted) 50%, transparent)",
      },
      ':is([aria-expanded="true"])': "var(--surface-muted)",
    },
    color: "var(--ink)",
  },
  destructive: {
    backgroundColor: {
      default: "color-mix(in srgb, var(--danger) 10%, transparent)",
      "@media (prefers-color-scheme: dark)": "color-mix(in srgb, var(--danger) 20%, transparent)",
      ":hover": {
        default: "color-mix(in srgb, var(--danger) 20%, transparent)",
        "@media (prefers-color-scheme: dark)": "color-mix(in srgb, var(--danger) 30%, transparent)",
      },
    },
    color: "var(--danger)",
    borderColor: {
      default: "transparent",
      ":focus-visible": "color-mix(in srgb, var(--danger) 40%, transparent)",
      ':is([aria-invalid="true"])': "var(--danger)",
    },
    boxShadow: {
      default: "none",
      ":focus-visible": {
        default: "0 0 0 3px color-mix(in srgb, var(--danger) 20%, transparent)",
        "@media (prefers-color-scheme: dark)":
          "0 0 0 3px color-mix(in srgb, var(--danger) 40%, transparent)",
      },
    },
  },
  link: {
    color: "var(--accent)",
    textUnderlineOffset: 4,
    textDecorationLine: {
      default: "none",
      ":hover": "underline",
    },
  },
})
const sizes = stylex.create({
  default: {
    height: 32,
    gap: 6,
    paddingInline: 10,
  },
  xs: {
    height: 24,
    gap: 4,
    paddingInline: 8,
    fontSize: 12,
  },
  sm: {
    height: 28,
    gap: 4,
    paddingInline: 10,
    fontSize: "0.8rem",
  },
  lg: {
    height: 36,
    gap: 6,
    paddingInline: 10,
  },
  icon: {
    width: 32,
    height: 32,
    padding: 0,
  },
  "icon-xs": {
    width: 24,
    height: 24,
    padding: 0,
  },
  "icon-sm": {
    width: 28,
    height: 28,
    padding: 0,
  },
  "icon-lg": {
    width: 36,
    height: 36,
    padding: 0,
  },
})

/** Accessible Base UI button with typed appearance and size variants. */
export function Button({
  xstyle,
  variant = "default",
  size = "default",
  ...props
}: StyledProps<ButtonPrimitive.Props> & {
  variant?: "default" | "bordered" | "secondary" | "ghost" | "destructive" | "link"
  size?: keyof typeof sizes
}) {
  return (
    <ButtonPrimitive
      data-slot="button"
      {...props}
      {...stylex.props(controlStyles.control, styles.root, styles[variant], sizes[size], xstyle)}
    />
  )
}
