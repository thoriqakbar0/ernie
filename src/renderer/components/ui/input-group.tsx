import type { ComponentProps } from "react"
import * as stylex from "@stylexjs/stylex"
import { Button } from "./button"
import { Input } from "./input"
import { Textarea } from "./textarea"
import type { StyledProps } from "./styles"
const styles = stylex.create({
  group: {
    position: "relative",
    display: "flex",
    width: "100%",
    minWidth: 0,
    alignItems: "center",
    height: {
      default: 32,
      ':has(> [data-align="block-end"], > [data-align="block-start"], > textarea)': "auto",
    },
    flexDirection: {
      default: "row",
      ':has(> [data-align="block-end"], > [data-align="block-start"])': "column",
    },
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: "var(--rule)",
      ':has([data-slot="input-group-control"]:focus-visible)': "var(--focus)",
      ':has([aria-invalid="true"])': "var(--danger)",
    },
    boxShadow: {
      default: "none",
      ':has([data-slot="input-group-control"]:focus-visible)':
        "0 0 0 3px color-mix(in srgb, var(--focus) 50%, transparent)",
      ':has([aria-invalid="true"])': "0 0 0 3px color-mix(in srgb, var(--danger) 20%, transparent)",
    },
    backgroundColor: {
      default: "transparent",
      "@media (prefers-color-scheme: dark)": "color-mix(in srgb, var(--rule) 30%, transparent)",
    },
    opacity: {
      default: 1,
      ":has(:disabled)": 0.5,
    },
    outlineStyle: "none",
    transition: "border-color 150ms, box-shadow 150ms",
  },
  addon: {
    display: "flex",
    height: "auto",
    cursor: "text",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBlock: 6,
    fontSize: 14,
    fontWeight: 500,
    color: "var(--muted)",
    userSelect: "none",
  },
  text: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "var(--muted)",
  },
  control: {
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    boxShadow: {
      default: "none",
      ":focus": "none",
      ":focus-visible": "none",
      ':is([aria-invalid="true"])': "none",
    },
    outlineStyle: "none",
  },
  textarea: {
    resize: "none",
    paddingBlock: 8,
  },
  button: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    boxShadow: {
      default: "none",
      ":focus-visible": "0 0 0 3px color-mix(in srgb, var(--focus) 50%, transparent)",
    },
  },
})
const alignments = stylex.create({
  "inline-start": {
    order: -1,
    paddingInlineStart: 8,
    marginInlineStart: {
      default: 0,
      ":has(> button)": "-0.3rem",
      ":has(> kbd)": "-0.15rem",
    },
  },
  "inline-end": {
    order: 1,
    paddingInlineEnd: 8,
    marginInlineEnd: {
      default: 0,
      ":has(> button)": "-0.3rem",
      ":has(> kbd)": "-0.15rem",
    },
  },
  "block-start": {
    order: -1,
    width: "100%",
    justifyContent: "flex-start",
    paddingInline: 10,
    paddingTop: 8,
  },
  "block-end": {
    order: 1,
    width: "100%",
    justifyContent: "flex-start",
    paddingInline: 10,
    paddingBottom: 8,
  },
})
const sizes = stylex.create({
  xs: {
    height: 24,
    gap: 4,
    borderRadius: "calc(var(--radius) - 3px)",
    paddingInline: 6,
  },
  sm: {},
  "icon-xs": {
    width: 24,
    height: 24,
    borderRadius: "calc(var(--radius) - 3px)",
    padding: 0,
  },
  "icon-sm": {
    width: 32,
    height: 32,
    padding: 0,
  },
})

/** Groups controls and addons while reflecting descendant validation and focus. */
export function InputGroup({ xstyle, ...props }: StyledProps<ComponentProps<"div">>) {
  return (
    <div data-slot="input-group" role="group" {...props} {...stylex.props(styles.group, xstyle)} />
  )
}
/** Places an addon and focuses its associated control on non-button clicks. */
export function InputGroupAddon({
  xstyle,
  align = "inline-start",
  ...props
}: StyledProps<ComponentProps<"div">> & {
  align?: keyof typeof alignments
}) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) return
        event.currentTarget.parentElement?.querySelector<HTMLElement>("input, textarea")?.focus()
      }}
      {...props}
      {...stylex.props(styles.addon, alignments[align], xstyle)}
    />
  )
}
/** Button sized for a control group; keeps the Base UI interaction contract. */
export function InputGroupButton({
  xstyle,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<ComponentProps<typeof Button>, "size" | "type"> & {
  size?: keyof typeof sizes
  type?: "button" | "submit" | "reset"
}) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      {...props}
      xstyle={[styles.button, sizes[size], xstyle]}
    />
  )
}
/** Supplementary text within a control group. */
export function InputGroupText({ xstyle, ...props }: StyledProps<ComponentProps<"span">>) {
  return <span {...props} {...stylex.props(styles.text, xstyle)} />
}
/** Removes the inner input border; the group owns the focus indicator. */
export function InputGroupInput({ xstyle, ...props }: StyledProps<ComponentProps<"input">>) {
  return <Input data-slot="input-group-control" {...props} xstyle={[styles.control, xstyle]} />
}
/** Resizable-by-content group textarea; the group owns the focus indicator. */
export function InputGroupTextarea({ xstyle, ...props }: StyledProps<ComponentProps<"textarea">>) {
  return (
    <Textarea
      data-slot="input-group-control"
      {...props}
      xstyle={[styles.control, styles.textarea, xstyle]}
    />
  )
}
