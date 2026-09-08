import { isAgentationInteraction } from "../agentation-interaction"
import { Popover } from "@base-ui/react/popover"
import { SlidersHorizontalIcon } from "lucide-react"
import type { PropsWithChildren } from "react"
import * as stylex from "@stylexjs/stylex"

const styles = stylex.create({
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingInline: 8,
    fontSize: 12,
    color: "var(--muted)",
    cursor: "pointer",
    maxWidth: "100%",
  },
  label: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  positioner: { zIndex: 1100 },
  title: { gridColumn: "1 / -1", margin: 0, fontSize: 14, fontWeight: 600 },
  popup: {
    display: "grid",
    gap: "12px 8px",
    gridTemplateColumns: "minmax(0, 188px) minmax(0, 1fr)",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    border: "1px solid var(--rule)",
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    boxShadow: "0 8px 32px rgb(0 0 0 / .16)",
    width: "min(360px, calc(100vw - 24px))",
    maxHeight: "var(--available-height)",
    overflowY: "auto",
  },
})

/** Keeps model selection and inference controls together outside the composer toolbar. */
export const ModelSettingsPopover = ({
  children,
  label,
  disabled,
}: PropsWithChildren<{ label: string; disabled: boolean }>) => (
  <Popover.Root
    onOpenChange={(open, details) => {
      if (!open && isAgentationInteraction(details.event)) details.cancel()
    }}
  >
    <Popover.Trigger
      disabled={disabled}
      aria-label="Model settings"
      {...stylex.props(styles.trigger)}
    >
      <SlidersHorizontalIcon size={14} aria-hidden="true" />
      <span {...stylex.props(styles.label)}>{label}</span>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        {...stylex.props(styles.positioner)}
      >
        <Popover.Popup {...stylex.props(styles.popup)}>
          <Popover.Title {...stylex.props(styles.title)}>Model settings</Popover.Title>
          {children}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
)
