import { styles } from "./workspace-loading.styles"
import * as stylex from "@stylexjs/stylex"
/** Announces workspace attachment progress without moving focus. */
export function WorkspaceLoading() {
  return (
    <div aria-label="Opening Prime Agent" role="status" {...stylex.props(styles.workspaceLoading)}>
      <span {...stylex.props(styles.workspaceLoadingRule)} />
      <span>Opening Prime Agent…</span>
      <span {...stylex.props(styles.workspaceLoadingRule)} />
    </div>
  )
}
