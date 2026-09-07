import { useRef, useState } from "react"
import * as stylex from "@stylexjs/stylex"
import { styles } from "./ui-annotations.styles"

export type UiAnnotation = Readonly<{
  id: string
  element: string
  context: string
  page: string
  comment: string
}>
export type UiSelection = Omit<UiAnnotation, "id" | "comment">

/** Edits a local note inline while its source UI remains available. */
export const UiAnnotationEditor = ({
  selection,
  onSave,
  onClose,
  finalFocus,
}: {
  selection: UiSelection
  onSave: (comment: string) => void
  onClose: () => void
  finalFocus: () => HTMLElement | null
}) => {
  const [comment, setComment] = useState("")
  const focused = useRef(false)
  const close = () => {
    onClose()
    finalFocus()?.focus()
  }
  return (
    <form
      aria-label={`Note on ${selection.element}`}
      {...stylex.props(styles.editor)}

      onSubmit={(event) => {
        event.preventDefault()
        if (comment.trim()) {
          onSave(comment.trim())
          finalFocus()?.focus()
        }
      }}
    >
      <label {...stylex.props(styles.label)}>
        {selection.element}
        <textarea
          ref={(element) => {
            if (element && !focused.current) {
              focused.current = true
              element.focus()
            }
          }}
          aria-label={`Note on ${selection.element}`}
          placeholder="Add a note…"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          required
          {...stylex.props(styles.field)}
        />
      </label>
      <div {...stylex.props(styles.actions)}>
        <button type="button" {...stylex.props(styles.button)} onClick={close}>
          Cancel
        </button>
        <button type="submit" {...stylex.props(styles.button)}>
          Add note
        </button>
      </div>
    </form>
  )
}
