import { useId, useState } from "react"
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
  container: { position: "relative", marginTop: "var(--subagent-top-gap, 0px)", paddingBottom: 4, overflow: "visible" },

  list: {
    animationName: expandIn,
    animationDuration: { "@media (prefers-reduced-motion: reduce)": "0ms", default: "220ms" },
    animationTimingFunction: "cubic-bezier(.2,.8,.2,1)",
    transformOrigin: "top center",
    gap: 0,
    padding: 0,
    marginInlineStart: "var(--subagent-list-inset, 30px)",
  },

  row: { minHeight: 36, padding: "2px 8px", borderRadius: 8 },
  toggle: {
    position: "relative",
    marginInlineStart: "var(--subagent-toggle-inset, 62px)",
    marginBlock: 2,
    paddingInline: 8,
    paddingBlock: 0,
    minHeight: 24,
    width: "max-content",
    maxWidth: "calc(100% - 76px)",
    gap: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    fontSize: 12,
    color: "var(--muted)",
    backgroundColor: "transparent",
    textDecoration: { default: "none", ":hover": "underline" },
    textUnderlineOffset: 2,
    boxShadow: { ":focus-visible": "inset 0 0 0 2px var(--focus)", default: "none" },
    cursor: "pointer",
  },
  toggleLabel: { display: "inline-flex", alignItems: "center", gap: "var(--subagent-chevron-gap, 2px)", paddingBlock: 3, minWidth: 0, lineHeight: 1.5 },
  chevron: {
    flexShrink: 0,
    overflow: "visible",
    transform: "rotate(-90deg)",
    transition: "transform 160ms ease",
    "@media (prefers-reduced-motion: reduce)": { transition: "none" },
  },
  expanded: { transform: "rotate(0deg)" },
  hidden: { display: "none" },
})

/** Native children appear as chats under their owning Agent, without creating duplicate roots. */
export const SubagentChats = ({
  parentId,
  parentName,
  search,
  onOpen,
}: {
  parentId: string
  parentName: string
  search: string
  onOpen: () => Promise<boolean>
}) => {
  const { data } = usePrimeSessionSnapshot(parentId)
  const { childChat, openChildChat } = useAppNavigation()
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const children = data?.useful.children ?? []
  if (!children.length) return null
  const open = expanded || Boolean(search.trim())
  return (
    <div {...stylex.props(layout.container)}>
      {!search.trim() ? <button
        type="button"
        aria-label={`${open ? "Hide" : "Show"} chats for ${parentName}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
        {...stylex.props(layout.toggle)}
      >
        <span {...stylex.props(layout.toggleLabel)}>
        <span>and {children.length} {children.length === 1 ? "other" : "others"}</span>
        <ChevronDownIcon
          size={14}
          aria-hidden="true"
          {...stylex.props(layout.chevron, open && layout.expanded)}
        />
        </span>
      </button> : null}
      <ul id={id} hidden={!open} {...stylex.props(styles.list, layout.list, !open && layout.hidden)}>
        {children
          .filter((child) =>
            `${parentName} ${child.sessionName ?? child.label}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((child) => (
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
                  if (!(await onOpen())) return
                  openChildChat({
                    parentId,
                    parentName,
                    childId: child.id,
                    name: child.sessionName ?? child.label,
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
          ))}
      </ul>
    </div>
  )
}
