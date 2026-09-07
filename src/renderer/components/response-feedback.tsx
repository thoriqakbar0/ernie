import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"
import type { ResponseAnnotation } from "../response-annotation"

const styles = stylex.create({
  comment: { marginBottom: 8, overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  detail: { flex: 1, minWidth: 0 },
  quote: {
    borderInlineStart: `2px solid ${theme["--accent"]}`,
    margin: "0 0 8px",
    overflowWrap: "anywhere",
    paddingInlineStart: 10,
    whiteSpace: "pre-wrap",
  },
  remove: { cursor: "pointer", fontSize: 20, minHeight: 36, minWidth: 36 },
  root: {
    color: theme["--ink"],
    fontSize: 13,
    maxHeight: 180,
    overflowY: "auto",
    padding: "4px 8px",
  },
  row: {
    alignItems: "start",
    borderBottomColor: theme["--rule"],
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: 8,
  },
  summary: {
    cursor: "pointer",
    overflow: "hidden",
    paddingBlock: 10,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
})

/** Reviews the feedback that will accompany the next message. */
export const ResponseFeedback = ({
  annotations,
  onRemove,
}: Readonly<{
  annotations: readonly ResponseAnnotation[]
  onRemove: (id: string) => void
}>) => (
  <section aria-label="Response feedback" {...stylex.props(styles.root)}>
    {annotations.map((annotation, index) => (
      <div key={annotation.id} {...stylex.props(styles.row)}>
        <details {...stylex.props(styles.detail)}>
          <summary {...stylex.props(styles.summary)}>
            Feedback {index + 1} · {annotation.agentName}: {annotation.comment}
          </summary>
          <blockquote {...stylex.props(styles.quote)}>{annotation.excerpt}</blockquote>
          <p {...stylex.props(styles.comment)}>{annotation.comment}</p>
        </details>
        <button
          type="button"
          aria-label={`Remove feedback ${index + 1}`}
          onClick={() => onRemove(annotation.id)}
          {...stylex.props(styles.remove)}
        >
          ×
        </button>
      </div>
    ))}
  </section>
)
