import { useAppNavigation } from "../app-navigation"
import { useCallback, useMemo } from "react"
import * as stylex from "@stylexjs/stylex"
import type { PrimeRlmChild, PrimeSessionSnapshot } from "../../packages/prime-agent"
import { styles } from "./subagent.styles"
import { ChildRow } from "./subagent-row"

/** A native child roster opens read-only threads while preserving the parent draft. */
export const SubagentActivity = ({ snapshot }: { snapshot: PrimeSessionSnapshot }) => {
  const { childChat, openChildChat } = useAppNavigation()
  const selectedId = childChat?.parentId === snapshot.session.id ? childChat.childId : undefined
  const openChild = useCallback(
    (next: PrimeRlmChild) => {
      openChildChat({
        childId: next.id,
        name: next.sessionName ?? next.label,
        parentId: snapshot.session.id,
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
    <section aria-label="Conversation participants" {...stylex.props(styles.root)}>
      <ul {...stylex.props(styles.list)}>
        {children.map((child) => (
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
    </section>
  )
}
