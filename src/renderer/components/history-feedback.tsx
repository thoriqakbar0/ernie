import * as stylex from "@stylexjs/stylex"
import { styles } from "./app-settings.styles"

/** Shows history progress and recoverable failures without replacing real history state. */
export const HistoryFeedback = ({
  message,
  notice,
  pending,
  retry,
}: {
  message?: string
  notice?: string
  pending: string | null
  retry?: () => Promise<void>
}) => (
  <div {...stylex.props(styles.feedback)}>
    {message ? <p role="alert">{message}</p> : null}
    {message && retry ? (
      <button
        type="button"
        disabled={pending !== null}
        {...stylex.props(styles.button)}
        onClick={retry}
      >
        Try again
      </button>
    ) : null}
    {notice ? (
      <p>
        <output>{notice}</output>
      </p>
    ) : null}
    {pending ? (
      <p {...stylex.props(styles.description)}>
        <output>{pending}</output>
      </p>
    ) : null}
  </div>
)
