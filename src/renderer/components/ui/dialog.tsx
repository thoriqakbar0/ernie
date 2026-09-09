import { isAgentationInteraction } from "../../agentation-interaction"
import { useAgentationActive } from "../../use-agentation-active"
import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import * as stylex from "@stylexjs/stylex"
import { controlStyles } from "./styles"
import type { StyledProps } from "./styles"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

const styles = stylex.create({
  DialogContent: {
    backgroundColor: "var(--surface)",
    borderRadius: 12,
    boxShadow: "0 0 0 1px color-mix(in srgb, var(--ink) 10%, transparent)",
    color: "var(--ink)",
    display: "grid",
    fontSize: 14,
    gap: 16,
    insetInlineStart: "50%",
    maxHeight: "calc(100dvh - 2rem)",
    maxWidth: {
      "@media (min-width: 640px)": 384,
      default: "calc(100% - 2rem)",
    },
    opacity: {
      ":is([data-starting-style], [data-ending-style])": 0,
      default: 1,
    },
    outlineStyle: "none",
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: 16,
    position: "fixed",
    scale: {
      ":is([data-starting-style], [data-ending-style])": 0.95,
      default: 1,
    },
    top: "50%",
    transform: "translate(-50%, -50%)",
    transition: "opacity 100ms, scale 100ms",
    width: "100%",
    zIndex: 50,
  },
  DialogDescription: {
    color: "var(--muted)",
    fontSize: 14,
    margin: 0,
  },
  DialogHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  DialogOverlay: {
    backdropFilter: "blur(4px)",
    backgroundColor: "rgb(0 0 0 / 0.1)",
    inset: 0,
    isolation: "isolate",
    opacity: {
      ":is([data-starting-style], [data-ending-style])": 0,
      default: 1,
    },
    position: "fixed",
    transition: "opacity 100ms",
    zIndex: 50,
  },
  DialogTitle: {
    fontSize: 16,
    fontWeight: 500,
    lineHeight: 1,
    margin: 0,
  },
  closeButton: {
    insetInlineEnd: 8,
    position: "absolute",
    top: 8,
  },
})

const Dialog = ({ onOpenChange, ...props }: StyledProps<DialogPrimitive.Root.Props>) => {
  const annotating = useAgentationActive()
  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      {...props}
      modal={annotating ? false : props.modal}
      onOpenChange={(open, details) => {
        if (!open && isAgentationInteraction(details.event)) {
          details.cancel()
          return
        }
        onOpenChange?.(open, details)
      }}
    />
  )
}
const DialogTrigger = ({ ...props }: StyledProps<DialogPrimitive.Trigger.Props>) => (
  <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
)
const DialogPortal = ({ ...props }: StyledProps<DialogPrimitive.Portal.Props>) => (
  <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
)
const DialogOverlay = ({ xstyle, ...props }: StyledProps<DialogPrimitive.Backdrop.Props>) => (
  <DialogPrimitive.Backdrop
    data-slot="dialog-overlay"
    {...stylex.props(styles.DialogOverlay, xstyle)}
    {...props}
  />
)
const DialogContent = ({
  xstyle,
  children,
  showCloseButton = true,
  ...props
}: StyledProps<DialogPrimitive.Popup.Props> & {
  showCloseButton?: boolean
}) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Popup
      data-slot="dialog-content"
      {...stylex.props(styles.DialogContent, xstyle)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close
          data-slot="dialog-close"
          render={<Button variant="ghost" xstyle={[styles.closeButton]} size="icon-sm" />}
        >
          <XIcon {...stylex.props(controlStyles.icon)} />
          <span {...stylex.props(controlStyles.hidden)}>Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Popup>
  </DialogPortal>
)
const DialogHeader = ({ xstyle, ...props }: StyledProps<React.ComponentProps<"div">>) => (
  <div data-slot="dialog-header" {...stylex.props(styles.DialogHeader, xstyle)} {...props} />
)
const DialogTitle = ({ xstyle, ...props }: StyledProps<DialogPrimitive.Title.Props>) => (
  <DialogPrimitive.Title
    data-slot="dialog-title"
    {...stylex.props(styles.DialogTitle, xstyle)}
    {...props}
  />
)
const DialogDescription = ({
  xstyle,
  ...props
}: StyledProps<DialogPrimitive.Description.Props>) => (
  <DialogPrimitive.Description
    data-slot="dialog-description"
    {...stylex.props(styles.DialogDescription, xstyle)}
    {...props}
  />
)
export { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger }
