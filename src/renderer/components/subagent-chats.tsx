import { ChevronDownIcon } from "lucide-react"
import * as stylex from "@stylexjs/stylex"
import { usePrimeSessionSnapshot } from "../prime-agent-state"
import { useAppNavigation } from "../app-navigation"
import { SubagentAvatar } from "./subagent-avatar"
import { styles } from "./agent-roster.styles"

const expandIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(-6px) scaleY(.94)" },
  to: { opacity: 1, transform: "translateY(0) scaleY(1)" },
})

const layout = stylex.create({
  chevron: {
    "@media (prefers-reduced-motion: reduce)": { transition: "none" },
    flexShrink: 0,
    overflow: "visible",
    transform: "rotate(-90deg)",
    transition: "transform 160ms ease",
  },

  container: {
    marginTop: "var(--subagent-top-gap, 0px)",
    overflow: "visible",
    paddingBottom: 4,
    position: "relative",
  },

  expanded: { transform: "rotate(0deg)" },

  hidden: { display: "none" },

  list: {
    animationDuration: { "@media (prefers-reduced-motion: reduce)": "0ms", default: "220ms" },
    animationName: expandIn,
    animationTimingFunction: "cubic-bezier(.2,.8,.2,1)",
    gap: 0,
    marginInlineStart: "var(--subagent-list-inset, 30px)",
    padding: 0,
    transformOrigin: "top center",
  },

  row: {
    borderRadius: "var(--subagent-row-radius, 8px)",
    minHeight: "var(--subagent-row-height, 36px)",
    padding: "2px 8px",
  },

  toggleLabel: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: "var(--muted)",
    cursor: "pointer",
    display: "inline-flex",
    fontSize: 12,
    gap: "var(--subagent-chevron-gap, 2px)",
    lineHeight: 1.5,
    minWidth: 0,
    paddingBlock: 3,
    paddingInline: 0,
    pointerEvents: "auto",
    position: "relative",
    textDecorationLine: { ":hover": "underline", default: "none" },
    textUnderlineOffset: 2,
    width: "fit-content",
  },
})

/** The count independently discloses the parent’s child chats. */
export const SubagentChatLabel = ({
  parentId,
  expanded,
  onToggle,
}: {
  parentId: string
  expanded: boolean
  onToggle: () => void
}) => {
  const { data } = usePrimeSessionSnapshot(parentId)
  const count = data?.useful.children.length ?? 0
  if (!count) {
    return null
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={`subagent-chats-${parentId}`}
      data-subagent-count
      {...stylex.props(layout.toggleLabel)}
    >
      <span>
        and {count} {count === 1 ? "other" : "others"}
      </span>
      <ChevronDownIcon
        size={14}
        aria-hidden="true"
        {...stylex.props(layout.chevron, expanded && layout.expanded)}
      />
    </button>
  )
}

/** Native children appear as chats under their owning Agent, without creating duplicate roots. */
export const SubagentChats = ({
  parentId,
  parentName,
  search,
  onOpen,
  expanded,
}: {
  expanded: boolean
  parentId: string
  parentName: string
  search: string
  onOpen: () => Promise<boolean>
}) => {
  const { data } = usePrimeSessionSnapshot(parentId)
  const { childChat, openChildChat } = useAppNavigation()
  const children = data?.useful.children ?? []
  if (!children.length) {
    return null
  }
  const open = expanded || Boolean(search.trim())
  return (
    <div {...stylex.props(layout.container)}>
      <ul
        id={`subagent-chats-${parentId}`}
        hidden={!open}
        {...stylex.props(styles.list, layout.list, !open && layout.hidden)}
      >
        {children.map((child) => {
          if (
            !`${parentName} ${child.sessionName ?? child.label}`
              .toLowerCase()
              .includes(search.toLowerCase())
          ) {
            return null
          }
          return (
            <li key={child.id}>
              <button
                type="button"
                aria-current={
                  childChat?.parentId === parentId && childChat.childId === child.id
                    ? "page"
                    : undefined
                }
                {...stylex.props(
                  styles.row,
                  layout.row,
                  childChat?.parentId === parentId &&
                    childChat.childId === child.id &&
                    styles.selected,
                )}
                onClick={async () => {
                  if (!(await onOpen())) {
                    return
                  }
                  openChildChat({
                    childId: child.id,
                    name: child.sessionName ?? child.label,
                    parentId,
                    parentName,
                  })
                }}
              >
                <SubagentAvatar
                  childId={child.id}
                  working={data?.transport.status === "connected" && child.status === "running"}
                />
                <span {...stylex.props(styles.rowText)}>
                  <strong {...stylex.props(styles.name)}>{child.sessionName ?? child.label}</strong>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
