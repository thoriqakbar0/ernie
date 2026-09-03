import type { KeyboardEvent } from "react"
import type { PrimeModel } from "../../packages/prime-agent"
import { ModelPicker } from "./model-picker"

type PrimeComposerProps = Readonly<{
  connected: boolean
  draft: string
  draftHero: boolean
  modelChangePending: boolean
  models: readonly PrimeModel[]
  modelsPending: boolean
  onDraftChange: (draft: string) => void
  onModelSelect: (model: PrimeModel) => void
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
  draft,
  draftHero,
  modelChangePending,
  models,
  modelsPending,
  onDraftChange,
  onModelSelect,
  selectedModel,
  sessionSelected,
  stopAction,
  stopping,
  submitAction,
  submitting,
  working,
}: PrimeComposerProps) {
  const inputDisabled = !sessionSelected || !connected || submitting || stopping

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
          placeholder={draftHero ? "Ask Ernie to build something…" : working ? "Add a follow-up for this run…" : "Describe the outcome, constraints, files, or checks…"}
          rows={draftHero ? 1 : 3}
          value={draft}
        />
        {draftHero ? null : <div className="prime-composer__footer">
          <div className="prime-composer__controls">
            <ModelPicker
              disabled={!sessionSelected || !connected || modelChangePending || modelsPending}
              models={models}
              onSelect={onModelSelect}
              selectedModel={selectedModel}
              side={draftHero ? "bottom" : "top"}
            />
            <span className="composer-hint">Enter to send · Shift+Enter for a new line</span>
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
              aria-label="Send message"
              className="composer-action composer-action--send"
              disabled={!draft.trim() || inputDisabled}
              type="submit"
            >
              <span>{submitting ? "Sending" : "Send"}</span>
              <SendIcon />
            </button>
          )}
        </div>}
      </div>
      {draftHero ? (
        <button
          className="composer-hero-submit"
          disabled={!draft.trim() || inputDisabled}
          type="submit"
        >
          {submitting ? "Starting" : "Start"}
        </button>
      ) : null}
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
