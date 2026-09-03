/** Announces workspace attachment progress without moving focus. */
export function WorkspaceLoading() {
  return (
    <div aria-label="Opening Prime Agent" className="workspace-loading" role="status">
      <span className="workspace-loading__rule" />
      <span>Opening Prime Agent…</span>
      <span className="workspace-loading__rule" />
    </div>
  )
}
