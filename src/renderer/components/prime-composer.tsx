import type { KeyboardEvent } from "react"
import type { PrimeModel } from "../../packages/prime-agent"
import { ModelPicker } from "./model-picker"

type PrimeComposerProps = Readonly<{
  connected: boolean
  draft: string
  draftHero: boolean
  models: readonly PrimeModel[]
  modelsPending: boolean
  onDraftChange: (draft: string) => void
  onModelSelect: (model: PrimeModel) => void
  selectedModelId: string
  sessionSelected: boolean
  stopAction: () => void
  stopping: boolean
  submitAction: (formData: FormData) => void
  submitting: boolean
  working: boolean
}>

/** Renders Ernie's draft and active-session input using one visual contract. */
export function PrimeComposer({
  connected,
  draft,
  draftHero,
  models,
  modelsPending,
  onDraftChange,
  onModelSelect,
  selectedModelId,
  sessionSelected,
  stopAction,
  stopping,
  submitAction,
  submitting,
  working,
}: PrimeComposerProps) {
  const inputDisabled = !sessionSelected || !connected || submitting || stopping

  return (
    <form action={submitAction} className="mx-auto w-full max-w-3xl" data-chat-composer>
      <div className="rounded-[22px] bg-zinc-300/80 p-px shadow-[0_12px_28px_-18px_rgba(0,0,0,0.4)] transition-colors focus-within:bg-zinc-400 dark:bg-white/10 dark:shadow-none dark:focus-within:bg-white/20">
        <div className="rounded-[21px] bg-white/95 px-3 pb-3 pt-3 backdrop-blur-xl dark:bg-zinc-950/95">
          <label className="sr-only" htmlFor="chat-message">Message Prime Agent</label>
          <textarea
            autoFocus={draftHero}
            className="min-h-[68px] w-full resize-none bg-transparent px-1 text-[15px] leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            disabled={inputDisabled}
            id="chat-message"
            name="message"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder={working ? "Queue a follow-up..." : "Ask Prime Agent to build something..."}
            rows={2}
            value={draft}
          />
          <div className="mt-1 flex min-w-0 items-center justify-between gap-3">
            <ModelPicker
              disabled={!sessionSelected || !connected || modelsPending}
              models={models}
              onSelect={onModelSelect}
              selectedModelId={selectedModelId}
              side={draftHero ? "bottom" : "top"}
            />
            {working ? (
              <button
                aria-label="Stop Prime Agent"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                disabled={stopping}
                formAction={stopAction}
                type="submit"
              >
                <span className="size-2.5 rounded-[2px] bg-current" />
              </button>
            ) : (
              <button
                aria-label="Send message"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600"
                disabled={!draft.trim() || inputDisabled}
                type="submit"
              >
                <SendIcon />
              </button>
            )}
          </div>
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
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 16 16">
      <path d="m3 8 5-5 5 5M8 3v10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  )
}
