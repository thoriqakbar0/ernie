import type { KeyboardEvent } from "react"
import type { PrimeEffort, PrimeModel } from "../../packages/prime-agent"
import { ModelPicker } from "./model-picker"
import { RecurrentDepthSlider } from "./recurrent-depth-slider"

type PrimeComposerProps = Readonly<{
  connected: boolean
  draft: string
  draftHero: boolean
  modelChangePending: boolean
  acceptedEffort: string | undefined
  acceptedRecurrentDepth: number | undefined
  models: readonly PrimeModel[]
  modelsPending: boolean
  onDraftChange: (draft: string) => void
  onEffortChange: (effort: PrimeEffort) => Promise<void>
  onEffortError: (message: string) => void
  onModelSelect: (model: PrimeModel) => void
  onRecurrentDepthChange: (depth: number) => Promise<void>
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
  acceptedRecurrentDepth,
  draft,
  draftHero,
  modelChangePending,
  models,
  modelsPending,
  onDraftChange,
  onEffortChange,
  onEffortError,
  onModelSelect,
  onRecurrentDepthChange,
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
      <div className={draftHero ? "prime-composer__surface prime-composer__surface--hero" : "prime-composer__surface"}>
        <label className="sr-only" htmlFor="chat-message">Message Prime Agent</label>
        <textarea
          autoFocus={draftHero}
          className="prime-composer__input"
          disabled={inputDisabled}
          id="chat-message"
          name="message"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={submitOnEnter}
          placeholder={recovering ? "Prime Agent is restoring this session…" : draftHero ? "Ask Ernie to build something…" : working ? "Add a follow-up for this run…" : "Describe the outcome, constraints, files, or checks…"}
          rows={3}
          value={draft}
        />
        <div className="prime-composer__footer">
          <div className="prime-composer__controls">
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
            <RecurrentDepthSlider
              acceptedDepth={acceptedRecurrentDepth}
              disabled={!sessionSelected || !connected || recovering || submitting || stopping}
              onChange={onRecurrentDepthChange}
              onError={onEffortError}
            />
          </div>
          {working ? (
            <button
              aria-label="Stop Prime Agent"
              className="composer-action composer-action--stop"
              disabled={!connected || stopping}
              formAction={stopAction}
              type="submit"
            >
              <StopIcon />
              <span>{stopping ? "Stopping" : "Stop"}</span>
            </button>
          ) : (
            <button
              aria-label={draftHero ? "Start conversation" : "Send message"}
              className="composer-action composer-action--send"
              disabled={!draft.trim() || inputDisabled}
              type="submit"
            >
              <span>{submitting ? (draftHero ? "Starting" : "Sending") : (draftHero ? "Start" : "Send")}</span>
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </form>
  )
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey) return
  event.preventDefault()
  event.currentTarget.form?.requestSubmit()
}

function SendIcon() {
  return (
    <svg aria-hidden="true" className="control-icon" fill="none" viewBox="0 0 16 16">
      <path d="m3 8 5-5 5 5M8 3v10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg aria-hidden="true" className="control-icon" fill="none" viewBox="0 0 16 16">
      <rect height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" width="7" x="4.5" y="4.5" />
    </svg>
  )
}
