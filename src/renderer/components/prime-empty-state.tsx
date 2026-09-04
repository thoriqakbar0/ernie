import { styles as sharedStyles } from "../component-styles"
import { styles } from "./prime-empty-state.styles"
import * as stylex from "@stylexjs/stylex"
import { useState, type FormEvent, type KeyboardEvent } from "react"
import { ArrowUpIcon } from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "./ui/input-group"
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
    <form onSubmit={submit} {...stylex.props(styles.emptyState)}>
      <div
        {...stylex.props(
          sharedStyles.primeComposer,
          sharedStyles.primeComposerHero,
          styles.emptyStateComposerShell,
        )}
      >
        <InputGroup xstyle={[sharedStyles.composerGroup]}>
          <label htmlFor="empty-state-prompt" {...stylex.props(sharedStyles.srOnly)}>
            Message Prime Agent
          </label>
          <InputGroupTextarea
            autoFocus
            disabled={creating}
            id="empty-state-prompt"
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder={`What should we build in ${workspaceName}?`}
            rows={1}
            value={prompt}
            xstyle={[sharedStyles.composerControl, sharedStyles.composerField]}
          />
          <InputGroupAddon align="block-end">
            <InputGroupButton
              aria-label="Start conversation"
              data-cy="prime-empty-create"
              disabled={creating || !prompt.trim()}
              size="sm"
              type="submit"
              variant="default"
              xstyle={[sharedStyles.composerAction]}
            >
              <span>{creating ? "Starting" : "Start"}</span>
              <ArrowUpIcon data-icon="inline-end" {...stylex.props(sharedStyles.controlIcon)} />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
      {creating ? (
        <p role="status" {...stylex.props(styles.emptyStateStatus)}>
          Starting Prime Agent in {workspaceName}…
        </p>
      ) : null}
      {error ? (
        <p role="alert" {...stylex.props(styles.inlineError)}>
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
