import { useEffect, useRef, useState, type ReactNode } from "react"
import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"
import type { ResponseAnnotation } from "../response-annotation"

/** Offers feedback on a selection wholly inside one assistant response. */
export function AnnotatableResponse({ children, messageId, agentName, onAdd }: Readonly<{
  children: ReactNode
  messageId: string
  agentName: string
  onAdd: (annotation: ResponseAnnotation) => void
}>) {
  const text = useRef<HTMLDivElement>(null)
  const [excerpt, setExcerpt] = useState("")
  const [editing, setEditing] = useState(false)
  const [comment, setComment] = useState("")
  function inspectSelection() {
    if (editing) return
    const selection = window.getSelection()
    const container = text.current
    if (!selection || !container || selection.isCollapsed || !selection.rangeCount) { setExcerpt(""); return }
    const range = selection.getRangeAt(0)
    const selected = selection.toString()
    setExcerpt(container.contains(range.startContainer) && container.contains(range.endContainer) && selected.trim() ? selected : "")
  }
  useEffect(() => {
    if (!excerpt || editing) return
    document.addEventListener("selectionchange", inspectSelection)
    return () => document.removeEventListener("selectionchange", inspectSelection)
  }, [excerpt, editing])
  function close() { setEditing(false); setExcerpt(""); setComment("") }
  return <div>
    <div ref={text} onPointerUp={inspectSelection} onKeyUp={inspectSelection}>{children}</div>
    {excerpt ? <div {...stylex.props(styles.feedback)}>
      {editing ? <div role="group" aria-label="Comment on selected text">
        <blockquote {...stylex.props(styles.quote)}>{excerpt}</blockquote>
        <label {...stylex.props(styles.label)}>Your comment
          <textarea autoFocus value={comment} onChange={event => setComment(event.target.value)} onKeyDown={event => {
            if (event.key === "Escape") { event.stopPropagation(); close() }
          }} {...stylex.props(styles.input)}/>
        </label>
        <div {...stylex.props(styles.actions)}>
          <button type="button" onClick={close} {...stylex.props(styles.button)}>Cancel</button>
          <button type="button" disabled={!comment.trim()} {...stylex.props(styles.button)} onClick={() => {
            onAdd({ id: crypto.randomUUID(), messageId, agentName, excerpt, comment: comment.trim() })
            close()
            document.getElementById("chat-message")?.focus()
          }}>Add feedback</button>
        </div>
      </div> : <button type="button" onPointerDown={event => event.preventDefault()} onClick={() => setEditing(true)} {...stylex.props(styles.button)}>Comment on selection</button>}
    </div> : null}
  </div>
}
const styles = stylex.create({
  feedback: { marginTop: 8, color: theme["--ink"], fontSize: 13 },
  quote: { margin: "0 0 8px", paddingInlineStart: 10, borderInlineStart: `2px solid ${theme["--accent"]}`, maxHeight: 90, overflowY: "auto", whiteSpace: "pre-wrap" },
  label: { display: "grid", gap: 6 },
  input: { width: "100%", minHeight: 70, padding: 10, border: `1px solid ${theme["--rule"]}`, borderRadius: 8, backgroundColor: theme["--surface"], color: theme["--ink"] },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  button: { minHeight: 36, padding: "6px 10px", borderRadius: 8, backgroundColor: theme["--surface-strong"], cursor: "pointer", opacity: { default: 1, ":disabled": 0.5 } },
})
