import { ErnieMark } from "./ernie-mark"
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

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="control-icon" fill="none" viewBox="0 0 16 16">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  )
}
