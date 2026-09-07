import { memo } from "react"
import * as stylex from "@stylexjs/stylex"
import { ChevronRightIcon } from "lucide-react"
import type { PrimeRlmChild } from "../../packages/prime-agent"
import { styles, statusOf, icons } from "./subagent.styles"

const ChildRowContent = ({
  child,
  parentName,
  selected,
  onOpen,
}: {
  child: PrimeRlmChild
  parentName?: string
  selected: boolean
  onOpen: (child: PrimeRlmChild, element: HTMLButtonElement) => void
}) => {
  const status = statusOf(child)
  const Icon = icons[status]
  return (
    <li>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={selected}
        {...stylex.props(styles.row)}
        onClick={(event) => onOpen(child, event.currentTarget)}
      >
        <Icon size={15} aria-hidden="true" />
        <span {...stylex.props(styles.name)}>{child.sessionName ?? child.label}</span>
        <span {...stylex.props(styles.status)}>{status}</span>
        <ChevronRightIcon size={14} aria-hidden="true" />
        {parentName ? <span {...stylex.props(styles.preview)}>From {parentName}</span> : null}
        <span {...stylex.props(styles.preview)}>
          {child.error ??
            child.answerPreview ??
            child.recap ??
            (status === "Waiting" ? "Waiting for a response" : "Open conversation")}
        </span>
      </button>
    </li>
  )
}
export const ChildRow = memo(ChildRowContent)
ChildRow.displayName = "ChildRow"
