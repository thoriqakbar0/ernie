import { useState } from "react"
import * as stylex from "@stylexjs/stylex"
import { styles } from "./ui-annotations.styles"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog"

export type UiAnnotation = Readonly<{
  id: string
  element: string
  context: string
  page: string
  comment: string
}>
export type UiSelection = Omit<UiAnnotation, "id" | "comment">

/** A selected app element becomes a local note only after explicit confirmation. */
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
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent
        data-ui-annotator
        data-react-grab-ignore-events
        xstyle={styles.dialog}
        finalFocus={finalFocus}
      >
        <DialogTitle>Annotate UI</DialogTitle>
        <DialogDescription>{selection.element}</DialogDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (comment.trim()) {
              onSave(comment.trim())
            }
          }}
        >
          <label {...stylex.props(styles.label)}>
            Note
            <textarea
              autoFocus
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              required
              {...stylex.props(styles.field)}
            />
          </label>
          <p {...stylex.props(styles.hint)}>
            Saved locally for review. Nothing is sent to an Agent.
          </p>
          <div {...stylex.props(styles.actions)}>
            <button type="button" {...stylex.props(styles.button)} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" {...stylex.props(styles.button)}>
              Add note
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
