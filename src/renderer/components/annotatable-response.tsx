import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"
import type { ResponseAnnotation } from "../response-annotation"

const styles = stylex.create({
  actions: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 },
  button: {
    backgroundColor: theme["--surface-strong"],
    borderRadius: 8,
    cursor: "pointer",
    minHeight: 36,
    opacity: { ":disabled": 0.5, default: 1 },
    padding: "6px 10px",
  },
  feedback: { color: theme["--ink"], fontSize: 13, marginTop: 8 },
  group: { borderWidth: 0, margin: 0, minWidth: 0, padding: 0 },
  input: {
    backgroundColor: theme["--surface"],
    borderColor: theme["--rule"],
    borderRadius: 8,
    borderStyle: "solid",
    borderWidth: 1,
    color: theme["--ink"],
    minHeight: 70,
    padding: 10,
    width: "100%",
  },
  label: { display: "grid", gap: 6 },
  quote: {
    borderInlineStart: `2px solid ${theme["--accent"]}`,
    margin: "0 0 8px",
    maxHeight: 90,
    overflowY: "auto",
    paddingInlineStart: 10,
    whiteSpace: "pre-wrap",
  },
})

/** Offers feedback on a selection wholly inside one assistant response. */
export const AnnotatableResponse = ({
  children,
  messageId,
  agentName,
  onAdd,
}: Readonly<{
  children: ReactNode
  messageId: string
  agentName: string
  onAdd: (annotation: ResponseAnnotation) => void
}>) => {
  const text = useRef<HTMLDivElement>(null)
  const [excerpt, setExcerpt] = useState("")
  const [editing, setEditing] = useState(false)
  const [comment, setComment] = useState("")
  const inspectSelection = useCallback(() => {
    if (editing) {
      return
    }
    const selection = window.getSelection()
    const container = text.current
    if (!selection || !container || selection.isCollapsed || !selection.rangeCount) {
      setExcerpt("")
      return
    }
    const range = selection.getRangeAt(0)
    const selected = selection.toString()
    setExcerpt(
      container.contains(range.startContainer) &&
        container.contains(range.endContainer) &&
        selected.trim()
        ? selected
        : "",
    )
  }, [editing])
  useEffect(() => {
    const container = text.current
    if (!container) {
      return
    }
    container.addEventListener("pointerup", inspectSelection)
    container.addEventListener("keyup", inspectSelection)
    return () => {
      container.removeEventListener("pointerup", inspectSelection)
      container.removeEventListener("keyup", inspectSelection)
    }
  }, [inspectSelection])
  useEffect(() => {
    if (!excerpt || editing) {
      return
    }
    document.addEventListener("selectionchange", inspectSelection)
    return () => document.removeEventListener("selectionchange", inspectSelection)
  }, [excerpt, editing, inspectSelection])
  const close = () => {
    setEditing(false)
    setExcerpt("")
    setComment("")
  }
  return (
    <div>
      <div ref={text}>{children}</div>
      {excerpt ? (
        <div {...stylex.props(styles.feedback)}>
          {editing ? (
            <fieldset aria-label="Comment on selected text" {...stylex.props(styles.group)}>
              <blockquote {...stylex.props(styles.quote)}>{excerpt}</blockquote>
              <label {...stylex.props(styles.label)}>
                Your comment
                <textarea
                  autoFocus
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation()
                      close()
                    }
                  }}
                  {...stylex.props(styles.input)}
                />
              </label>
              <div {...stylex.props(styles.actions)}>
                <button type="button" onClick={close} {...stylex.props(styles.button)}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!comment.trim()}
                  {...stylex.props(styles.button)}
                  onClick={() => {
                    onAdd({
                      agentName,
                      comment: comment.trim(),
                      excerpt,
                      id: crypto.randomUUID(),
                      messageId,
                    })
                    close()
                    document.querySelector<HTMLElement>("#chat-message")?.focus()
                  }}
                >
                  Add feedback
                </button>
              </div>
            </fieldset>
          ) : (
            <button
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setEditing(true)}
              {...stylex.props(styles.button)}
            >
              Comment on selection
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
