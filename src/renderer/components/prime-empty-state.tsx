import { useState, type FormEvent, type KeyboardEvent } from "react"
import { getWorkspaceName } from "./workspace-name"

type PrimeEmptyStateProps = Readonly<{
  creating: boolean
  cwd: string
  error?: string
  onCreate: (prompt: string) => void
}>

export function PrimeEmptyState({ creating, cwd, error, onCreate }: PrimeEmptyStateProps) {
  const workspaceName = getWorkspaceName(cwd)
  const [prompt, setPrompt] = useState("")

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!prompt.trim() || creating) return
    onCreate(prompt)
  }

  return (
    <form className="empty-state" onSubmit={submit}>
      <div className="empty-state__composer-shell prime-composer prime-composer--hero">
        <div className="prime-composer__surface prime-composer__surface--hero">
          <label className="sr-only" htmlFor="empty-state-prompt">Message Prime Agent</label>
          <textarea
            autoFocus
            className="prime-composer__input"
            disabled={creating}
            id="empty-state-prompt"
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder={`What should we build in ${workspaceName}?`}
            rows={3}
            value={prompt}
          />
          <div className="prime-composer__footer">
            <div className="prime-composer__controls" />
            <button
              aria-label="Start conversation"
              className="composer-action composer-action--send"
              data-cy="prime-empty-create"
              disabled={creating || !prompt.trim()}
              type="submit"
            >
              <span>{creating ? "Starting" : "Start"}</span>
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
      {creating ? (
        <p className="empty-state__status" role="status">
          Starting Prime Agent in {workspaceName}…
        </p>
      ) : null}
      {error ? (
        <p className="inline-error" role="alert">
          <span>{error}</span>. Submit the prompt to try again.
        </p>
      ) : null}
    </form>
  )
}

function SendIcon() {
  return (
    <svg aria-hidden="true" className="control-icon" fill="none" viewBox="0 0 16 16">
      <path d="m3 8 5-5 5 5M8 3v10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  )
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey) return
  event.preventDefault()
  event.currentTarget.form?.requestSubmit()
}
