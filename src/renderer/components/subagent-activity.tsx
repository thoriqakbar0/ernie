import { useAppNavigation } from "../app-navigation"
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react"
import * as stylex from "@stylexjs/stylex"
import type { PrimeRlmChild, PrimeSessionSnapshot } from "../../packages/prime-agent"
import { styles } from "./subagent.styles"
import { ChildRow } from "./subagent-row"

const subscribeCompact = (notify: () => void) => {
  const query = window.matchMedia("(max-width: 480px)")
  query.addEventListener("change", notify)
  return () => query.removeEventListener("change", notify)
}
const isCompact = () => window.matchMedia("(max-width: 480px)").matches

/** A native child roster opens read-only threads while preserving the parent draft. */
export const SubagentActivity = ({ snapshot }: { snapshot: PrimeSessionSnapshot }) => {
  const compact = useSyncExternalStore(subscribeCompact, isCompact, () => false)
  const visibleCount = compact ? 1 : 3
  const { childChat, openChildChat } = useAppNavigation()
  const selectedId = childChat?.parentId === snapshot.session.id ? childChat.childId : undefined
  const rosterHeading = useRef<HTMLElement | null>(null)
  const openChild = useCallback(
    (next: PrimeRlmChild) => {
      openChildChat({
        parentId: snapshot.session.id,
        childId: next.id,
        name: next.sessionName ?? next.label,
        parentName: snapshot.session.name ?? "Agent",
      })
    },
    [openChildChat, snapshot.session.id, snapshot.session.name],
  )
  const { children } = snapshot.useful
  const byId = useMemo(() => new Map(children.map((child) => [child.id, child])), [children])
  const current =
    snapshot.transport.status === "connected" && snapshot.useful.childrenAvailable !== false
  if (!children.length) {
    return null
  }
  return (
    <section
      ref={rosterHeading}
      tabIndex={-1}
      aria-label="Conversation participants"
      {...stylex.props(styles.root)}
    >
      <ul {...stylex.props(styles.list)}>
        {children.slice(0, visibleCount).map((child) => (
          <ChildRow
            key={child.id}
            child={child}
            current={current}
            parentName={
              child.parentId
                ? (byId.get(child.parentId)?.sessionName ??
                  byId.get(child.parentId)?.label ??
                  child.parentId)
                : undefined
            }
            selected={selectedId === child.id}
            onOpen={openChild}
          />
        ))}
      </ul>
      {children.length > visibleCount ? (
        <details {...stylex.props(styles.overflow)}>
          <summary
            onKeyDown={(event) => {
              const details = event.currentTarget.parentElement
              if (event.key === "Escape" && details instanceof HTMLDetailsElement) {
                details.open = false
                event.stopPropagation()
              }
            }}
            aria-label={`Show ${children.length - visibleCount} more ${children.length - visibleCount === 1 ? "participant" : "participants"}`}
            {...stylex.props(styles.more)}
          >
            +{children.length - visibleCount}
          </summary>
          <ul aria-label="More participants" {...stylex.props(styles.overflowList)}>
            {children.slice(visibleCount).map((child) => (
              <ChildRow
                key={child.id}
                child={child}
                current={current}
                parentName={
                  child.parentId
                    ? (byId.get(child.parentId)?.sessionName ??
                      byId.get(child.parentId)?.label ??
                      child.parentId)
                    : undefined
                }
                selected={selectedId === child.id}
                onOpen={openChild}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
