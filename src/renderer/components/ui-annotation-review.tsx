import { DisclosureSummary } from "./ui/disclosure-summary"
import { useState } from "react"
import * as stylex from "@stylexjs/stylex"
import type { UiAnnotation } from "./ui-annotation-editor"
import { styles } from "./ui-annotations.styles"

/** Reviews local UI notes and copies them only on request. */
export const UiAnnotationReview = ({
  notes,
  onRemove,
}: {
  notes: readonly UiAnnotation[]
  onRemove: (id: string) => void
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
    <section aria-label="UI notes" {...stylex.props(styles.review)}>
      <div {...stylex.props(styles.actions)}>
        {notes.length ? (
          <button type="button" {...stylex.props(styles.button)} onClick={copy}>
            Copy notes
          </button>
        ) : (
          <p>No UI notes yet.</p>
        )}
      </div>
      <ul {...stylex.props(styles.list)}>
        {notes.map((note) => (
          <li key={note.id} {...stylex.props(styles.note)}>
            <strong>{note.element}</strong>
            <p>{note.comment}</p>
            <details>
              <DisclosureSummary>Context</DisclosureSummary>
              <pre {...stylex.props(styles.hint)}>{note.context}</pre>
            </details>
            <button
              type="button"
              {...stylex.props(styles.button)}
              onClick={() => onRemove(note.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <output {...stylex.props(styles.hint)}>{feedback}</output>
    </section>
  )
}
