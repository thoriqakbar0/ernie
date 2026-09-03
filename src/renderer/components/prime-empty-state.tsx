import { useState, type FormEvent, type KeyboardEvent } from "react"
import { ArrowUpIcon } from "lucide-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "./ui/input-group"
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
        <InputGroup>
          <label className="sr-only" htmlFor="empty-state-prompt">Message Prime Agent</label>
          <InputGroupTextarea
            autoFocus
            className="min-h-10 max-h-40 overflow-y-auto"
            disabled={creating}
            id="empty-state-prompt"
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder={`What should we build in ${workspaceName}?`}
            rows={1}
            value={prompt}
          />
          <InputGroupAddon align="block-end">
            <InputGroupButton
              aria-label="Start conversation"
              className="ml-auto"
              data-cy="prime-empty-create"
              disabled={creating || !prompt.trim()}
              size="sm"
              type="submit"
              variant="default"
            >
              <span>{creating ? "Starting" : "Start"}</span>
              <ArrowUpIcon data-icon="inline-end" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
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
