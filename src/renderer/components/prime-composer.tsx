import { styles } from "./composer.stylex"
import type { KeyboardEvent } from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"
import type { PrimeEffort, PrimeModel } from "../../packages/prime-agent"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "./ui/input-group"
import { ModelPicker } from "./model-picker"

type PrimeComposerProps = Readonly<{
  connected: boolean
  draft: string
  draftHero: boolean
  modelChangePending: boolean
  acceptedEffort: string | undefined
  models: readonly PrimeModel[]
  modelsPending: boolean
  onDraftChange: (draft: string) => void
  onEffortChange: (effort: PrimeEffort) => Promise<void>
  onEffortError: (message: string) => void
  onModelSelect: (model: PrimeModel) => void
  recovering: boolean
  selectedModel: PrimeModel | undefined
  sessionSelected: boolean
  stopAction: () => void
  stopping: boolean
  submitAction: (formData: FormData) => void
  submitting: boolean
  working: boolean
}>

export function PrimeComposer({
  connected,
  acceptedEffort,
  draft,
  draftHero,
  modelChangePending,
  models,
  modelsPending,
  onDraftChange,
  onEffortChange,
  onEffortError,
  onModelSelect,
  recovering,
  selectedModel,
  sessionSelected,
  stopAction,
  stopping,
  submitAction,
  submitting,
  working,
}: PrimeComposerProps) {
  const inputDisabled = !sessionSelected || !connected || recovering || submitting || stopping

  return (
    <form
      action={submitAction}
      className={draftHero ? "prime-composer prime-composer--hero" : "prime-composer"}
      data-chat-composer
    >
      <InputGroup>
        <label className="sr-only" htmlFor="chat-message">Message Prime Agent</label>
        <InputGroupTextarea
          autoFocus={draftHero}
          xstyle={styles.prompt}
          disabled={inputDisabled}
          id="chat-message"
          name="message"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={submitOnEnter}
          placeholder={recovering ? "Reconnecting to this session…" : draftHero ? "What should Ernie build?" : working ? "Add a follow-up…" : "What should Ernie do next?"}
          rows={1}
          value={draft}
        />
        <InputGroupAddon align="block-end">
          <ModelPicker
            acceptedEffort={acceptedEffort}
            disabled={!sessionSelected || !connected || recovering || modelChangePending || modelsPending}
            models={models}
            onEffortChange={onEffortChange}
            onEffortError={onEffortError}
            onSelect={onModelSelect}
            selectedModel={selectedModel}
            side={draftHero ? "bottom" : "top"}
          />
          {working ? (
            <InputGroupButton
              aria-label="Stop Prime Agent"
              xstyle={styles.action}
              disabled={!connected || stopping}
              formAction={stopAction}
              size="sm"
              type="submit"
              variant="destructive"
            >
              <SquareIcon data-icon="inline-start" />
              <span>{stopping ? "Stopping" : "Stop"}</span>
            </InputGroupButton>
          ) : (
            <InputGroupButton
              aria-label={draftHero ? "Start conversation" : "Send message"}
              xstyle={styles.action}
              disabled={!draft.trim() || inputDisabled}
              size="sm"
              type="submit"
              variant="default"
            >
              <span>{submitting ? (draftHero ? "Starting" : "Sending") : (draftHero ? "Start" : "Send")}</span>
              <ArrowUpIcon data-icon="inline-end" />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey) return
  event.preventDefault()
  event.currentTarget.form?.requestSubmit()
}
