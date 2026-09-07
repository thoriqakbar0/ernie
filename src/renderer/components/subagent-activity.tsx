import { useEffect, useId, useRef, useState } from "react"
import * as stylex from "@stylexjs/stylex"
import type { PrimeSessionSnapshot } from "../../packages/prime-agent"
import { theme } from "../theme.stylex"

const styles = stylex.create({
  back: {
    color: theme["--ink"],
    cursor: "pointer",
    minHeight: 32,
    textAlign: "start",
    textDecorationLine: "underline",
  },
  list: { display: "grid", gap: 4 },
  name: { fontWeight: 500, overflowWrap: "anywhere" },
  panel: {
    backgroundColor: theme["--surface"],
    borderRadius: 10,
    display: "grid",
    gap: 10,
    minWidth: 0,
    overflowWrap: "anywhere",
    padding: 12,
  },
  relationship: { color: theme["--muted"], gridColumn: "1 / -1", overflowWrap: "anywhere" },
  root: { display: "grid", gap: 8, minWidth: 0 },
  row: {
    backgroundColor: { ":hover": theme["--surface-strong"], default: theme["--surface"] },
    borderRadius: 8,
    boxShadow: { ":focus-visible": "0 0 0 2px var(--focus)", default: null },
    color: theme["--ink"],
    cursor: "pointer",
    display: "grid",
    gap: 6,
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minHeight: 44,
    padding: 10,
    textAlign: "start",
  },
  text: { color: theme["--ink"], overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
})

const isRosterCurrent = (snapshot: PrimeSessionSnapshot) =>
  snapshot.transport.status === "connected" && snapshot.useful.childrenAvailable !== false

/** Inspects native roster evidence without changing the attached conversation. */
export const SubagentActivity = ({ snapshot }: { snapshot: PrimeSessionSnapshot }) => {
  const [selectedId, setSelectedId] = useState<string>()
  const opener = useRef<HTMLButtonElement | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)
  const roster = useRef<HTMLElement | null>(null)
  const panelId = useId()
  const { children } = snapshot.useful
  const selected = children.find((child) => child.id === selectedId)
  if (selectedId && !selected) {
    setSelectedId(undefined)
  }
  useEffect(() => {
    if (!selectedId) {
      return
    }
    const panelHeading = heading.current
    panelHeading?.focus()
    const section = roster.current
    const summary = section?.closest("details")?.querySelector<HTMLElement>("summary")
    return () => {
      if (panelHeading?.isConnected === false && opener.current) {
        const fallback = section?.querySelector<HTMLButtonElement>("button") ?? summary
        opener.current = null
        fallback?.focus()
      }
    }
  }, [selectedId])
  const current = isRosterCurrent(snapshot)
  const nameOf = (id: string) => {
    const child = children.find((item) => item.id === id)
    return child?.sessionName ?? child?.label ?? id
  }
  if (!children.length) {
    return null
  }
  return (
    <section ref={roster} aria-label="Subagent activity" {...stylex.props(styles.root)}>
      <p>
        Subagents · {children.length}
        {current ? "" : " · last known state"}
      </p>
      <div {...stylex.props(styles.list)}>
        {children.map((child) => (
          <button
            key={child.id}
            type="button"
            aria-expanded={selectedId === child.id}
            aria-controls={panelId}
            {...stylex.props(styles.row)}
            onClick={(event) => {
              opener.current = event.currentTarget
              setSelectedId(child.id)
            }}
          >
            <span {...stylex.props(styles.name)}>{child.sessionName ?? child.label}</span>
            <span>{child.status}</span>
            {child.parentId ? (
              <small {...stylex.props(styles.relationship)}>From {nameOf(child.parentId)}</small>
            ) : null}
          </button>
        ))}
      </div>
      <div id={panelId}>
        {selected ? (
          <div {...stylex.props(styles.panel)}>
            <button
              type="button"
              {...stylex.props(styles.back)}
              onClick={() => {
                setSelectedId(undefined)
                opener.current?.focus()
                opener.current = null
              }}
            >
              ← Back to conversation
            </button>
            <h3 ref={heading} tabIndex={-1}>
              {selected.sessionName ?? selected.label}
            </h3>
            <p>
              Native roster preview · {current ? selected.status : `last known: ${selected.status}`}
            </p>
            {selected.parentId ? (
              <p>
                Parent:{" "}
                {children.some((child) => child.id === selected.parentId) ? (
                  <button
                    type="button"
                    {...stylex.props(styles.back)}
                    onClick={() => {
                      setSelectedId(selected.parentId)
                    }}
                  >
                    {nameOf(selected.parentId)}
                  </button>
                ) : (
                  nameOf(selected.parentId)
                )}
              </p>
            ) : (
              <p>Parent: {snapshot.session.name ?? "this conversation"}</p>
            )}
            {selected.activity && selected.status === "running" ? (
              <p>
                {current ? "Activity" : "Last activity"}: {selected.activity.kind}
                {selected.activity.toolName ? ` · ${selected.activity.toolName}` : ""}
              </p>
            ) : null}
            {selected.repliedSinceTask === undefined ? null : (
              <p>
                {selected.repliedSinceTask
                  ? "Reply received since the latest task"
                  : "No reply received since the latest task"}
              </p>
            )}
            {selected.error ? <p {...stylex.props(styles.text)}>Error: {selected.error}</p> : null}
            {selected.answerPreview ? (
              <div>
                <h4>Reply preview</h4>
                <p {...stylex.props(styles.text)}>{selected.answerPreview}</p>
              </div>
            ) : (
              <p>No reply preview available.</p>
            )}
            {selected.recap ? (
              <div>
                <h4>Recap</h4>
                <p {...stylex.props(styles.text)}>{selected.recap}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
