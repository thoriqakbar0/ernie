import { SubagentAvatar } from "./subagent-avatar"
import { memo } from "react"
import { Tooltip } from "@base-ui/react/tooltip"
import * as stylex from "@stylexjs/stylex"
import { ChevronRightIcon } from "lucide-react"
import type { PrimeRlmChild } from "../../packages/prime-agent"
import { styles, statusOf, icons } from "./subagent.styles"

const ChildRowContent = ({
  child,
  parentName,
  current,
  selected,
  onOpen,
}: {
  child: PrimeRlmChild
  parentName?: string
  current: boolean
  selected: boolean
  onOpen: (child: PrimeRlmChild, element: HTMLButtonElement) => void
}) => {
  const status = statusOf(child)
  const Icon = icons[status]
  const label = `${child.sessionName ?? child.label} · ${status}${current ? "" : " · last known state"}${parentName ? ` · From ${parentName}` : ""} · Open conversation`
  return (
    <li {...stylex.props(styles.item)}>
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger
            aria-label={label}
            aria-haspopup="dialog"
            aria-expanded={selected}
            {...stylex.props(styles.row)}
            onClick={(event) => onOpen(child, event.currentTarget)}
          >
            <SubagentAvatar
              childId={child.id}
              size="small"
              working={current && status === "Running"}
            />
            <span {...stylex.props(styles.status)}>
              <Icon size={10} aria-hidden="true" />
            </span>
            <ChevronRightIcon size={10} aria-hidden="true" />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner
              side="bottom"
              sideOffset={6}
              {...stylex.props(styles.tooltipPositioner)}
            >
              <Tooltip.Popup {...stylex.props(styles.tooltip)}>{label}</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    </li>
  )
}
export const ChildRow = memo(ChildRowContent)
ChildRow.displayName = "ChildRow"
