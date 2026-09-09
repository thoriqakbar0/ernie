import { isAgentationInteraction } from "../agentation-interaction"
import { Popover } from "@base-ui/react/popover"
import { SlidersHorizontalIcon } from "lucide-react"
import type { PropsWithChildren } from "react"
import * as stylex from "@stylexjs/stylex"

const styles = stylex.create({
  label: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  popup: {
    alignItems: "center",
    backgroundColor: "var(--surface)",
    border: "1px solid var(--rule)",
    borderRadius: 12,
    boxShadow: "0 8px 32px rgb(0 0 0 / .16)",
    color: "var(--ink)",
    display: "grid",
    gap: "12px 8px",
    gridTemplateColumns: "minmax(0, 1fr)",
    maxHeight: "var(--available-height)",
    overflowY: "auto",
    padding: 12,
    width: "min(360px, calc(100vw - 24px))",
  },
  positioner: { zIndex: 1100 },
  title: { fontSize: 14, fontWeight: 600, gridColumn: "1 / -1", margin: 0 },
  trigger: {
    alignItems: "center",
    color: "var(--muted)",
    cursor: "pointer",
    display: "inline-flex",
    fontSize: 12,
    gap: 6,
    maxWidth: "100%",
    minHeight: 36,
    paddingInline: 8,
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
      if (!open && isAgentationInteraction(details.event)) {
        details.cancel()
      }
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
