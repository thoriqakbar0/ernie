import type { ComponentProps } from "react"
import * as stylex from "@stylexjs/stylex"
import { Button } from "./button"
import { Input } from "./input"
import { Textarea } from "./textarea"
import type { StyledProps } from "./styles"

const styles = stylex.create({
  addon: {
    alignItems: "center",
    color: "var(--muted)",
    cursor: "text",
    display: "flex",
    fontSize: 14,
    fontWeight: 500,
    gap: 8,
    height: "auto",
    justifyContent: "center",
    paddingBlock: 6,
    userSelect: "none",
  },
  button: {
    alignItems: "center",
    boxShadow: {
      ":focus-visible": "0 0 0 3px color-mix(in srgb, var(--focus) 50%, transparent)",
      default: "none",
    },
    display: "flex",
    fontSize: 14,
    gap: 8,
  },
  control: {
    backgroundColor: "transparent",
    borderRadius: 0,
    borderWidth: 0,
    boxShadow: {
      ":focus": "none",
      ":focus-visible": "none",
      ':is([aria-invalid="true"])': "none",
      default: "none",
    },
    flex: 1,
    outlineStyle: "none",
  },
  group: {
    alignItems: "center",
    backgroundColor:
      "var(--ernie-light, transparent) var(--ernie-dark, color-mix(in srgb, var(--rule) 30%, transparent))",
    borderColor: {
      ':has([aria-invalid="true"])': "var(--danger)",
      ':has([data-slot="input-group-control"]:focus-visible)': "var(--focus)",
      default: "var(--rule)",
    },
    borderRadius: 8,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: {
      ':has([aria-invalid="true"])': "0 0 0 3px color-mix(in srgb, var(--danger) 20%, transparent)",
      ':has([data-slot="input-group-control"]:focus-visible)':
        "0 0 0 3px color-mix(in srgb, var(--focus) 50%, transparent)",
      default: "none",
    },
    display: "flex",
    flexDirection: {
      ':has(> [data-align="block-end"], > [data-align="block-start"])': "column",
      default: "row",
    },
    height: {
      ':has(> [data-align="block-end"], > [data-align="block-start"], > textarea)': "auto",
      default: 32,
    },
    margin: 0,
    minWidth: 0,
    opacity: {
      ':has([data-slot="input-group-control"]:disabled)': 0.5,
      default: 1,
    },
    outlineStyle: "none",
    padding: 0,
    position: "relative",
    transition: "border-color 150ms, box-shadow 150ms",
    width: "100%",
  },
  textarea: {
    paddingBlock: 8,
    resize: "none",
  },
})
const alignments = stylex.create({
  "block-end": {
    justifyContent: "flex-start",
    order: 1,
    paddingBottom: 8,
    paddingInline: 10,
    width: "100%",
  },
  "block-start": {
    justifyContent: "flex-start",
    order: -1,
    paddingInline: 10,
    paddingTop: 8,
    width: "100%",
  },
  "inline-end": {
    marginInlineEnd: {
      ":has(> button)": "-0.3rem",
      ":has(> kbd)": "-0.15rem",
      default: 0,
    },
    order: 1,
    paddingInlineEnd: 8,
  },
  "inline-start": {
    marginInlineStart: {
      ":has(> button)": "-0.3rem",
      ":has(> kbd)": "-0.15rem",
      default: 0,
    },
    order: -1,
    paddingInlineStart: 8,
  },
})
const sizes = stylex.create({
  "icon-sm": {
    height: 32,
    padding: 0,
    width: 32,
  },
  "icon-xs": {
    borderRadius: "calc(var(--radius) - 3px)",
    height: 24,
    padding: 0,
    width: 24,
  },
  sm: {},
  xs: {
    borderRadius: "calc(var(--radius) - 3px)",
    gap: 4,
    height: 24,
    paddingInline: 6,
  },
})

/** Groups controls and addons while reflecting descendant validation and focus. */
export const InputGroup = ({ xstyle, ...props }: StyledProps<ComponentProps<"fieldset">>) => (
  <fieldset data-slot="input-group" {...props} {...stylex.props(styles.group, xstyle)} />
)

/** Places an addon and focuses its associated control on non-button clicks. */
export const InputGroupAddon = ({
  xstyle,
  align = "inline-start",
  ...props
}: StyledProps<ComponentProps<"div">> & {
  align?: keyof typeof alignments
}) => (
  <div
    role="toolbar"
    tabIndex={0}
    onKeyDown={(event) => {
      if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault()
        event.currentTarget.parentElement?.querySelector<HTMLElement>("input, textarea")?.focus()
      }
    }}
    data-slot="input-group-addon"
    data-align={align}
    onClick={(event) => {
      if (event.target instanceof Element && event.target.closest("button")) {
        return
      }
      event.currentTarget.parentElement?.querySelector<HTMLElement>("input, textarea")?.focus()
    }}
    {...props}
    {...stylex.props(styles.addon, alignments[align], xstyle)}
  />
)

/** Button sized for a control group; keeps the Base UI interaction contract. */
export const InputGroupButton = ({
  xstyle,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<ComponentProps<typeof Button>, "size" | "type"> & {
  size?: keyof typeof sizes
  type?: "button" | "submit" | "reset"
}) => (
  <Button
    type={type}
    data-size={size}
    variant={variant}
    {...props}
    xstyle={[styles.button, sizes[size], xstyle]}
  />
)

/** Removes the inner input border; the group owns the focus indicator. */
export const InputGroupInput = ({ xstyle, ...props }: StyledProps<ComponentProps<"input">>) => (
  <Input data-slot="input-group-control" {...props} xstyle={[styles.control, xstyle]} />
)

/** Resizable-by-content group textarea; the group owns the focus indicator. */
export const InputGroupTextarea = ({
  xstyle,
  ...props
}: StyledProps<ComponentProps<"textarea">>) => (
  <Textarea
    data-slot="input-group-control"
    {...props}
    xstyle={[styles.control, styles.textarea, xstyle]}
  />
)
