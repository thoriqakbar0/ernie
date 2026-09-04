import * as stylex from "@stylexjs/stylex"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { withClassName, withStyle } from "@/lib/stylex"
import { styles } from "./button.stylex"

const variants = {
  default: styles.primary,
  outline: styles.outline,
  secondary: styles.secondary,
  ghost: styles.ghost,
  destructive: styles.destructive,
  link: styles.link,
}
const sizes = {
  default: styles.normal,
  xs: styles.xs,
  sm: styles.sm,
  lg: styles.lg,
  icon: styles.icon,
  "icon-xs": styles.iconXs,
  "icon-sm": styles.iconSm,
  "icon-lg": styles.iconLg,
}

/** Base UI button with composable StyleX variants and an optional application class. */
function Button({
  className,
  variant = "default",
  size = "default",
  xstyle,
  style,
  ...props
}: ButtonPrimitive.Props & {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  xstyle?: stylex.StyleXStyles
}) {
  const compiled = stylex.props(styles.root, variants[variant], sizes[size], xstyle)
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={withClassName(compiled.className, className)}
      style={withStyle(compiled.style, style)}
      {...props}
    />
  )
}

export { Button }
