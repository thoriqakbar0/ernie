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
      <label className="sr-only" htmlFor="empty-state-prompt">Message Prime Agent</label>
      <div className="empty-state__composer">
        <textarea
          autoFocus
          className="empty-state__input"
          disabled={creating}
          id="empty-state-prompt"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={submitOnEnter}
          placeholder={`What should we build in ${workspaceName}?`}
          rows={3}
          value={prompt}
        />
        <button
          aria-label="Start conversation"
          className="empty-state__submit"
          data-cy="prime-empty-create"
          disabled={creating || !prompt.trim()}
          type="submit"
        >
          {creating ? "Starting…" : "Send"}
        </button>
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

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey) return
  event.preventDefault()
  event.currentTarget.form?.requestSubmit()
}
