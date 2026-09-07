import { useEffect, useId, useRef, useState } from "react"
import * as stylex from "@stylexjs/stylex"
import type { PrimeSessionSnapshot } from "../../packages/prime-agent"
import { theme } from "../theme.stylex"

/** Inspects native roster evidence without changing the attached conversation. */
export function SubagentActivity({ snapshot }: { snapshot: PrimeSessionSnapshot }) {
  const [selectedId, setSelectedId] = useState<string>()
  const opener = useRef<HTMLButtonElement | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)
  const roster = useRef<HTMLElement | null>(null)
  const panelId = useId()
  useEffect(() => { if (selectedId) heading.current?.focus() }, [selectedId])
  const children = snapshot.useful.children
  const selected = children.find(child => child.id === selectedId)
  useEffect(() => {
    if (!selectedId || selected) return
    const section = roster.current
    const fallback = section?.querySelector<HTMLButtonElement>("button")
      ?? section?.closest("details")?.querySelector<HTMLElement>("summary")
    setSelectedId(undefined)
    opener.current = null
    fallback?.focus()
  }, [selectedId, selected])
  const current = snapshot.transport.status === "connected" && snapshot.useful.childrenAvailable !== false
  const nameOf = (id: string) => {
    const child = children.find(item => item.id === id)
    return child?.sessionName ?? child?.label ?? id
  }
  if (!children.length && !selectedId) return null
  return <section ref={roster} aria-label="Subagent activity" {...stylex.props(styles.root)}>
    <p>Subagents · {children.length}{current ? "" : " · last known state"}</p>
    <div {...stylex.props(styles.list)}>{children.map(child => <button
      key={child.id} type="button" aria-expanded={selectedId === child.id} aria-controls={panelId}
      {...stylex.props(styles.row)} onClick={event => {
        opener.current = event.currentTarget
        setSelectedId(child.id)
      }}>
      <span {...stylex.props(styles.name)}>{child.sessionName ?? child.label}</span>
      <span>{child.status}</span>
      {child.parentId ? <small {...stylex.props(styles.relationship)}>From {nameOf(child.parentId)}</small> : null}
    </button>)}</div>
    <div id={panelId}>
      {selected ? <div {...stylex.props(styles.panel)}>
        <button type="button" {...stylex.props(styles.back)} onClick={() => { setSelectedId(undefined); opener.current?.focus() }}>← Back to conversation</button>
        <h3 ref={heading} tabIndex={-1}>{selected.sessionName ?? selected.label}</h3>
        <p>Native roster preview · {current ? selected.status : `last known: ${selected.status}`}</p>
        {selected.parentId ? <p>Parent: {children.some(child => child.id === selected.parentId)
          ? <button type="button" {...stylex.props(styles.back)} onClick={() => { setSelectedId(selected.parentId) }}>{nameOf(selected.parentId)}</button>
          : nameOf(selected.parentId)}</p> : <p>Parent: {snapshot.session.name ?? "this conversation"}</p>}
        {selected.activity && selected.status === "running" ? <p>{current ? "Activity" : "Last activity"}: {selected.activity.kind}{selected.activity.toolName ? ` · ${selected.activity.toolName}` : ""}</p> : null}
        {selected.repliedSinceTask !== undefined ? <p>{selected.repliedSinceTask ? "Reply received since the latest task" : "No reply received since the latest task"}</p> : null}
        {selected.error ? <p {...stylex.props(styles.text)}>Error: {selected.error}</p> : null}
        {selected.answerPreview ? <div><h4>Reply preview</h4><p {...stylex.props(styles.text)}>{selected.answerPreview}</p></div> : <p>No reply preview available.</p>}
        {selected.recap ? <div><h4>Recap</h4><p {...stylex.props(styles.text)}>{selected.recap}</p></div> : null}
      </div> : selectedId ? <p role="status">This subagent is no longer in the native roster.</p> : null}
    </div>
  </section>
}

const styles = stylex.create({
  root: { display: "grid", gap: 8, minWidth: 0 },
  list: { display: "grid", gap: 4 },
  row: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 6, minHeight: 44, padding: 10, textAlign: "start", borderRadius: 8, color: theme["--ink"], backgroundColor: { default: theme["--surface"], ":hover": theme["--surface-strong"] }, outlineStyle: "solid", outlineWidth: { default: 0, ":focus-visible": 2 }, outlineColor: theme["--ink"], cursor: "pointer" },
  name: { overflowWrap: "anywhere", fontWeight: 500 },
  relationship: { gridColumn: "1 / -1", overflowWrap: "anywhere", color: theme["--muted"] },
  panel: { display: "grid", gap: 10, minWidth: 0, padding: 12, borderRadius: 10, backgroundColor: theme["--surface"], overflowWrap: "anywhere" },
  back: { color: theme["--ink"], textAlign: "start", textDecoration: "underline", minHeight: 32, cursor: "pointer" },
  text: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: theme["--ink"] },
})
