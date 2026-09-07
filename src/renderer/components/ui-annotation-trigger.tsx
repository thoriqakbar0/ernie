import { MessageSquarePlusIcon, XIcon } from "lucide-react"
import * as stylex from "@stylexjs/stylex"
import { useUiAnnotation } from "./ui-annotation-context"
import { styles } from "./ui-annotations.styles"

/** Header controls for shell-owned, local UI notes. */
export const UiAnnotationTrigger = () => {
  const annotation = useUiAnnotation()
  if (!annotation) {
    return null
  }
  return (
    <div data-ui-annotator data-react-grab-ignore-events {...stylex.props(styles.toolbar)}>
      <button
        data-ui-annotation-trigger
        disabled={annotation.editing}
        type="button"
        aria-label={annotation.active ? "Stop annotating" : "Annotate UI"}
        aria-pressed={annotation.active}
        title="Annotate UI · local notes · ⌘⇧A"
        aria-keyshortcuts="Meta+Shift+A Control+Shift+A"
        {...stylex.props(styles.trigger)}
        onClick={annotation.handleActivate}
      >
        {annotation.active ? (
          <XIcon size={16} aria-hidden="true" />
        ) : (
          <MessageSquarePlusIcon size={16} aria-hidden="true" />
        )}
      </button>
      {annotation.count > 0 ? (
        <button
          type="button"
          aria-expanded={annotation.review}
          {...stylex.props(styles.trigger)}
          onClick={annotation.handleToggleReview}
        >
          Notes · {annotation.count}
        </button>
      ) : null}
      {annotation.feedback ? (
        <output {...stylex.props(styles.hint)}>{annotation.feedback}</output>
      ) : null}
    </div>
  )
}
