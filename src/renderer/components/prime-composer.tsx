import { styles as sharedStyles } from "../component-styles"
import * as stylex from "@stylexjs/stylex"
import type { KeyboardEvent } from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"
import type { PrimeEffort, PrimeModel } from "../../packages/prime-agent"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "./ui/input-group"
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
      data-chat-composer
      {...stylex.props(sharedStyles.primeComposer, draftHero && sharedStyles.primeComposerHero)}
    >
      <InputGroup xstyle={[sharedStyles.composerGroup]}>
        <label htmlFor="chat-message" {...stylex.props(sharedStyles.srOnly)}>
          Message Prime Agent
        </label>
        <InputGroupTextarea
          autoFocus={draftHero}
          disabled={inputDisabled}
          id="chat-message"
          name="message"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={submitOnEnter}
          placeholder={
            recovering
              ? "Reconnecting to this session…"
              : draftHero
                ? "What should Ernie build?"
                : working
                  ? "Add a follow-up…"
                  : "What should Ernie do next?"
          }
          rows={1}
          value={draft}
          xstyle={[sharedStyles.composerControl, sharedStyles.composerField]}
        />
        <InputGroupAddon align="block-end">
          <ModelPicker
            acceptedEffort={acceptedEffort}
            disabled={
              !sessionSelected || !connected || recovering || modelChangePending || modelsPending
            }
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
              disabled={!connected || stopping}
              formAction={stopAction}
              size="sm"
              type="submit"
              variant="destructive"
              xstyle={[sharedStyles.composerAction]}
            >
              <SquareIcon data-icon="inline-start" {...stylex.props(sharedStyles.controlIcon)} />
              <span>{stopping ? "Stopping" : "Stop"}</span>
            </InputGroupButton>
          ) : (
            <InputGroupButton
              aria-label={draftHero ? "Start conversation" : "Send message"}
              disabled={!draft.trim() || inputDisabled}
              size="sm"
              type="submit"
              variant="default"
              xstyle={[sharedStyles.composerAction]}
            >
              <span>
                {submitting ? (draftHero ? "Starting" : "Sending") : draftHero ? "Start" : "Send"}
              </span>
              <ArrowUpIcon data-icon="inline-end" {...stylex.props(sharedStyles.controlIcon)} />
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
