import { SubagentAvatar } from "./subagent-avatar"
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react"
import * as stylex from "@stylexjs/stylex"
import { ArrowLeftIcon } from "lucide-react"
import type { PrimeRlmChild, PrimeSessionSnapshot } from "../../packages/prime-agent"
import { styles, statusOf } from "./subagent.styles"
import { ChildRow } from "./subagent-row"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog"
import { SubagentConversation } from "./subagent-conversation"

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
  const [selectedId, setSelectedId] = useState<string>()
  const opener = useRef<HTMLButtonElement | null>(null)
  const rosterHeading = useRef<HTMLElement | null>(null)
  const openChild = useCallback((next: PrimeRlmChild, element: HTMLButtonElement) => {
    opener.current = element
    setSelectedId(next.id)
  }, [])
  const { children } = snapshot.useful
  const byId = useMemo(() => new Map(children.map((child) => [child.id, child])), [children])
  const selected = selectedId ? byId.get(selectedId) : undefined
  if (selectedId && !selected) {
    setSelectedId(undefined)
  }
  const current =
    snapshot.transport.status === "connected" && snapshot.useful.childrenAvailable !== false
  if (!children.length) {
    return null
  }
  const parentName = snapshot.session.name ?? "conversation"
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
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(undefined)
          }
        }}
      >
        <DialogContent
          xstyle={styles.panel}
          showCloseButton={false}
          finalFocus={() =>
            opener.current?.isConnected
              ? opener.current
              : (rosterHeading.current ?? document.querySelector<HTMLElement>("#ernie-workspace"))
          }
        >
          {selected ? (
            <>
              <header {...stylex.props(styles.header)}>
                <button
                  type="button"
                  {...stylex.props(styles.back)}
                  onClick={() => setSelectedId(undefined)}
                >
                  <ArrowLeftIcon size={16} aria-hidden="true" />
                  Back to {parentName}
                </button>
                <div {...stylex.props(styles.participant)}>
                  <SubagentAvatar
                    childId={selected.id}
                    size="default"
                    working={current && statusOf(selected) === "Running"}
                  />
                  <DialogTitle>{selected.sessionName ?? selected.label}</DialogTitle>
                </div>
                <DialogDescription>
                  {statusOf(selected)}
                  {current ? "" : " · last known state"}
                  {selected.parentId
                    ? ` · From ${byId.get(selected.parentId)?.sessionName ?? byId.get(selected.parentId)?.label ?? selected.parentId}`
                    : ` · From ${parentName}`}
                </DialogDescription>
              </header>
              <SubagentConversation parentId={snapshot.session.id} childId={selected.id} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
