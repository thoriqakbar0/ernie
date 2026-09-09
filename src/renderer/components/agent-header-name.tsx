import type { ReactNode } from "react"
import { Tooltip } from "@base-ui/react/tooltip"
import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"

const styles = stylex.create({
  name: {
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    backgroundColor: {
      ":hover": theme["--surface-muted"],
      default: "transparent",
    },
    borderRadius: 6,
    borderWidth: 0,
    boxShadow: { ":focus-visible": `inset 0 0 0 2px ${theme["--focus"]}`, default: "none" },
    color: theme["--ink"],
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 0,
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.35,
    maxWidth: "var(--header-agent-max-width, 28ch)",
    minWidth: 0,
    minHeight: 34,
    padding: "5px 6px",
    overflow: "hidden",
    overflowWrap: "anywhere",
    position: "relative",
    textAlign: "start",
  },
  selected: {
    backgroundColor: `color-mix(in srgb, ${theme["--surface-muted"]} 91%, transparent)`,
  },
  popup: {
    backgroundColor: theme["--surface"],
    borderColor: theme["--rule"],
    borderRadius: 6,
    borderStyle: "solid",
    borderWidth: 1,
    color: theme["--ink"],
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: "min(320px, calc(100vw - 24px))",
    overflowWrap: "anywhere",
    padding: "8px 10px",
  },
  positioner: { zIndex: 100 },
})

/** Long identities keep a compact header and expose their full name on hover or keyboard focus. */
export const AgentHeaderName = ({
  name,
  avatar,
  onClick,
  selected,
}: {
  name: string
  avatar?: ReactNode
  onClick?: () => void
  selected?: boolean
}) =>
  name ? (
    <Tooltip.Root>
      <Tooltip.Trigger
        onClick={onClick}
        aria-pressed={selected}
        type="button"
        closeOnClick={false}
        {...stylex.props(styles.name, selected && styles.selected)}
      >
        {avatar}
        <span>{name}</span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          {...stylex.props(styles.positioner)}
        >
          <Tooltip.Popup {...stylex.props(styles.popup)}>{name}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  ) : null
