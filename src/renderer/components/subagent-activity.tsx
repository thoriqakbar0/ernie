import { useCallback, useMemo, useRef, useState } from "react"
import * as stylex from "@stylexjs/stylex"
import { ArrowLeftIcon } from "lucide-react"
import type { PrimeRlmChild, PrimeSessionSnapshot } from "../../packages/prime-agent"
import { styles, statusOf } from "./subagent.styles"
import { ChildRow } from "./subagent-row"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog"
import { SubagentConversation } from "./subagent-conversation"

/** A native child roster opens read-only threads while preserving the parent draft. */
export const SubagentActivity = ({ snapshot }: { snapshot: PrimeSessionSnapshot }) => {
  const [selectedId, setSelectedId] = useState<string>()
  const opener = useRef<HTMLButtonElement | null>(null)
  const rosterHeading = useRef<HTMLHeadingElement | null>(null)
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
    <section aria-label="Subagent threads" {...stylex.props(styles.root)}>
      <h2 ref={rosterHeading} tabIndex={-1} {...stylex.props(styles.heading)}>
        Subagents · {children.length}
        {current ? "" : " · last known state"}
      </h2>
      <ul {...stylex.props(styles.list)}>
        {children.map((child) => (
          <ChildRow
            key={child.id}
            child={child}
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
                <DialogTitle>{selected.sessionName ?? selected.label}</DialogTitle>
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
