import * as React from "react"
import * as stylex from "@stylexjs/stylex"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { styles } from "./input-group.stylex"
import { styles as fieldStyles } from "./field.stylex"

const alignments = {
  "inline-start": styles.inlineStart,
  "inline-end": styles.inlineEnd,
  "block-start": styles.blockStart,
  "block-end": styles.blockEnd,
}
const sizes = { xs: styles.xs, sm: null, "icon-xs": styles.iconXs, "icon-sm": styles.iconSm }

/** Group boundary for shared focus, validation, and addon layout. */
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={[stylex.props(styles.root).className, className].filter(Boolean).join(" ")}
      {...props}
    />
  )
}

/** Addon that focuses its sibling field when clicked outside a button. */
function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & { align?: keyof typeof alignments }) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={[stylex.props(styles.addon, alignments[align]).className, className]
        .filter(Boolean)
        .join(" ")}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("button")) return
        event.currentTarget.parentElement?.querySelector<HTMLElement>("input, textarea")?.focus()
      }}
      {...props}
    />
  )
}

/** Compact button whose caller styles override its group size. */
function InputGroupButton({
  type = "button",
  variant = "ghost",
  size = "xs",
  xstyle,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size" | "type"> & {
  size?: keyof typeof sizes
  type?: "button" | "submit" | "reset"
}) {
  return (
    <Button
      type={type}
      data-group-size={size}
      variant={variant}
      xstyle={[styles.button, sizes[size], xstyle]}
      {...props}
    />
  )
}

/** Supporting text within an input group. */
function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="input-group-text"
      className={[stylex.props(styles.text).className, className].filter(Boolean).join(" ")}
      {...props}
    />
  )
}

/** Borderless input controlled by the group's focus treatment. */
function InputGroupInput({ xstyle, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input data-slot="input-group-control" xstyle={[fieldStyles.groupControl, xstyle]} {...props} />
  )
}

/** Borderless textarea controlled by the group's focus treatment. */
function InputGroupTextarea({ xstyle, ...props }: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      data-slot="input-group-control"
      xstyle={[fieldStyles.groupControl, fieldStyles.groupTextarea, xstyle]}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
