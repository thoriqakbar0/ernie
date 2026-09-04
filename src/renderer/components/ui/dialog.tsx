import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import * as stylex from "@stylexjs/stylex"
import { controlStyles, type StyledProps } from "./styles"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
function Dialog({ ...props }: StyledProps<DialogPrimitive.Root.Props>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}
function DialogTrigger({ ...props }: StyledProps<DialogPrimitive.Trigger.Props>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}
function DialogPortal({ ...props }: StyledProps<DialogPrimitive.Portal.Props>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}
function DialogClose({ ...props }: StyledProps<DialogPrimitive.Close.Props>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}
function DialogOverlay({ xstyle, ...props }: StyledProps<DialogPrimitive.Backdrop.Props>) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      {...stylex.props(styles.DialogOverlay, xstyle)}
      {...props}
    />
  )
}
function DialogContent({
  xstyle,
  children,
  showCloseButton = true,
  ...props
}: StyledProps<DialogPrimitive.Popup.Props> & {
  showCloseButton?: boolean
}) {
  return (
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
}
function DialogHeader({ xstyle, ...props }: StyledProps<React.ComponentProps<"div">>) {
  return <div data-slot="dialog-header" {...stylex.props(styles.DialogHeader, xstyle)} {...props} />
}
function DialogFooter({
  xstyle,
  showCloseButton = false,
  children,
  ...props
}: StyledProps<React.ComponentProps<"div">> & {
  showCloseButton?: boolean
}) {
  return (
    <div data-slot="dialog-footer" {...stylex.props(styles.DialogFooter, xstyle)} {...props}>
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="bordered" />}>Close</DialogPrimitive.Close>
      )}
    </div>
  )
}
function DialogTitle({ xstyle, ...props }: StyledProps<DialogPrimitive.Title.Props>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      {...stylex.props(styles.DialogTitle, xstyle)}
      {...props}
    />
  )
}
function DialogDescription({ xstyle, ...props }: StyledProps<DialogPrimitive.Description.Props>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      {...stylex.props(styles.DialogDescription, xstyle)}
      {...props}
    />
  )
}
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
const styles = stylex.create({
  DialogOverlay: {
    position: "fixed",
    inset: 0,
    isolation: "isolate",
    zIndex: 50,
    backgroundColor: "rgb(0 0 0 / 0.1)",
    backdropFilter: "blur(4px)",
    opacity: {
      default: 1,
      ":is([data-starting-style], [data-ending-style])": 0,
    },
    transition: "opacity 100ms",
  },
  DialogContent: {
    position: "fixed",
    top: "50%",
    insetInlineStart: "50%",
    zIndex: 50,
    display: "grid",
    width: "100%",
    maxWidth: {
      default: "calc(100% - 2rem)",
      "@media (min-width: 640px)": 384,
    },
    transform: "translate(-50%, -50%)",
    gap: 16,
    borderRadius: 12,
    backgroundColor: "var(--surface)",
    padding: 16,
    fontSize: 14,
    color: "var(--ink)",
    boxShadow: "0 0 0 1px color-mix(in srgb, var(--ink) 10%, transparent)",
    outlineStyle: "none",
    opacity: {
      default: 1,
      ":is([data-starting-style], [data-ending-style])": 0,
    },
    scale: {
      default: 1,
      ":is([data-starting-style], [data-ending-style])": 0.95,
    },
    transition: "opacity 100ms, scale 100ms",
  },
  closeButton: {
    position: "absolute",
    top: 8,
    insetInlineEnd: 8,
  },
  DialogHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  DialogFooter: {
    marginInline: -16,
    marginBottom: -16,
    display: "flex",
    flexDirection: {
      default: "column-reverse",
      "@media (min-width: 640px)": "row",
    },
    justifyContent: {
      default: null,
      "@media (min-width: 640px)": "flex-end",
    },
    gap: 8,
    borderEndStartRadius: 12,
    borderEndEndRadius: 12,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--rule)",
    backgroundColor: "color-mix(in srgb, var(--surface-muted) 50%, transparent)",
    padding: 16,
  },
  DialogTitle: {
    fontSize: 16,
    lineHeight: 1,
    fontWeight: 500,
    margin: 0,
  },
  DialogDescription: {
    fontSize: 14,
    color: "var(--muted)",
    margin: 0,
  },
})
