import { useState } from "react"
import * as stylex from "@stylexjs/stylex"
import type { UiAnnotation } from "./ui-annotation-editor"
import { styles } from "./ui-annotations.styles"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog"

/** Reviews local UI notes and copies them only on request. */
export const UiAnnotationReview = ({
  notes,
  onRemove,
  onClose,
}: {
  notes: readonly UiAnnotation[]
  onRemove: (id: string) => void
  onClose: () => void
}) => {
  const [feedback, setFeedback] = useState("")
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        notes
          .map(
            (note, index) =>
              `${index + 1}. ${note.element}\nPage: ${note.page}\n${note.comment}\n\n${note.context}`,
          )
          .join("\n\n"),
      )
      setFeedback("Notes copied.")
    } catch {
      setFeedback("Could not copy notes. Select the text below to copy it manually.")
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent data-ui-annotator data-react-grab-ignore-events xstyle={styles.dialog}>
        <DialogTitle>UI notes</DialogTitle>
        <DialogDescription>
          App interface only. Embedded websites aren’t included. Notes remain here until this window
          reloads.
        </DialogDescription>
        <ul {...stylex.props(styles.list)}>
          {notes.map((note) => (
            <li key={note.id} {...stylex.props(styles.note)}>
              <strong>{note.element}</strong>
              <p>{note.comment}</p>
              <details>
                <summary>Element context</summary>
                <pre {...stylex.props(styles.hint)}>{note.context}</pre>
              </details>
              <button
                type="button"
                {...stylex.props(styles.button)}
                onClick={() => onRemove(note.id)}
              >
                Remove note
              </button>
            </li>
          ))}
        </ul>
        {notes.length ? (
          <button type="button" {...stylex.props(styles.button)} onClick={copy}>
            Copy notes
          </button>
        ) : (
          <p>No UI notes yet.</p>
        )}
        <output {...stylex.props(styles.hint)}>{feedback}</output>
      </DialogContent>
    </Dialog>
  )
}
