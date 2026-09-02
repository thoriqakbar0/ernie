import { ErnieMark } from "./ernie-mark"
import { PlusIcon } from "./plus-icon"
import { getWorkspaceName } from "./workspace-name"

type PrimeEmptyStateProps = Readonly<{
  creating: boolean
  cwd: string
  error?: string
  onCreate: () => void
}>

export function PrimeEmptyState({ creating, cwd, error, onCreate }: PrimeEmptyStateProps) {
  const workspaceName = getWorkspaceName(cwd)

  return (
    <div className="empty-state">
      <div className="empty-state__mark"><ErnieMark className="size-full" /></div>
      <h2>Start work in <span title={cwd}>{workspaceName}</span></h2>
      <p>Ernie will create a durable Prime Agent session in this workspace.</p>
      <button
        aria-label="New conversation"
        className="primary-button"
        data-cy="prime-empty-create"
        disabled={creating}
        onClick={onCreate}
        type="button"
      >
        <PlusIcon />
        {creating ? "Starting session…" : "Start session"}
      </button>
      {creating ? (
        <p className="empty-state__status" role="status">
          Starting Prime Agent in {workspaceName}…
        </p>
      ) : null}
      {error ? (
        <p className="inline-error" role="alert">
          <span>{error}</span>. Select Start session to try again.
        </p>
      ) : null}
    </div>
  )
}
