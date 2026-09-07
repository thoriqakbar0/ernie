import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"
import type { ResponseAnnotation } from "../response-annotation"

/** Reviews the feedback that will accompany the next message. */
export function ResponseFeedback({ annotations, onRemove }: Readonly<{
  annotations: readonly ResponseAnnotation[]
  onRemove: (id: string) => void
}>) {
  return <section aria-label="Response feedback" {...stylex.props(styles.root)}>
    {annotations.map((annotation, index) => <div key={annotation.id} {...stylex.props(styles.row)}>
      <details {...stylex.props(styles.detail)}>
        <summary {...stylex.props(styles.summary)}>Feedback {index + 1} · {annotation.agentName}: {annotation.comment}</summary>
        <blockquote {...stylex.props(styles.quote)}>{annotation.excerpt}</blockquote>
        <p {...stylex.props(styles.comment)}>{annotation.comment}</p>
      </details>
      <button type="button" aria-label={`Remove feedback ${index + 1}`} onClick={() => onRemove(annotation.id)} {...stylex.props(styles.remove)}>×</button>
    </div>)}
  </section>
}
const styles = stylex.create({
  root: { maxHeight: 180, overflowY: "auto", padding: "4px 8px", fontSize: 13, color: theme["--ink"] },
  row: { display: "flex", alignItems: "start", gap: 8, borderBottom: `1px solid ${theme["--rule"]}` },
  detail: { minWidth: 0, flex: 1 },
  summary: { paddingBlock: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" },
  quote: { margin: "0 0 8px", paddingInlineStart: 10, borderInlineStart: `2px solid ${theme["--accent"]}`, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  comment: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginBottom: 8 },
  remove: { minWidth: 36, minHeight: 36, cursor: "pointer", fontSize: 20 },
})
