import { styles as sharedStyles } from "../component-styles"
import * as stylex from "@stylexjs/stylex"
import { useId, type KeyboardEvent } from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"
import type { PrimeEffort, PrimeModel } from "../../packages/prime-agent"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "./ui/input-group"
import { ModelPicker } from "./model-picker"
import type { ConversationSubmission } from "../conversation-flow"

type PrimeComposerProps = Readonly<{
  connected: boolean
  opening?: boolean
  draft: string
  draftHero: boolean
  agentName?: string
  feedback?: ConversationSubmission
  releaseSend?: () => Promise<void>
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
  stopAction: () => void | Promise<void>
  stopping: boolean
  submitAction: (formData: FormData) => void | Promise<void>
  submitting: boolean
  working: boolean
}>

/** Keeps composition editable while creation, attachment, and sending settle. */
export function PrimeComposer({ connected, acceptedEffort, draft, draftHero, agentName = "Agent", feedback, releaseSend,
  modelChangePending, models, modelsPending, onDraftChange, onEffortChange, onEffortError, onModelSelect,
  opening = false, recovering, selectedModel, sessionSelected, stopAction, stopping, submitAction, submitting, working,
}: PrimeComposerProps) {
  const inputId = "chat-message"
  const feedbackId = useId()
  const uncertain = feedback?.status === "unknown"
  const unavailable = submitting || (!uncertain && (!connected || recovering || stopping))
  const message = feedback?.status === "error" || uncertain ? feedback.message
    : feedback?.status === "creating" ? "Starting conversation…"
    : feedback?.status === "sending" ? "Sending message…"
    : feedback?.status === "queued" && working ? "Queued after the current work."
    : feedback?.status === "accepted" && working ? "Sent."
    : undefined
  // Keep pending feedback urgent while external session selection changes during creation.
  return <form onSubmit={(event) => {
    event.preventDefault()
    void submitAction(new FormData(event.currentTarget))
  }} data-chat-composer {...stylex.props(sharedStyles.primeComposer, draftHero && sharedStyles.primeComposerHero)}>
    <InputGroup xstyle={[sharedStyles.composerGroup]}>
      <label htmlFor={inputId} {...stylex.props(sharedStyles.srOnly)}>Message {agentName}</label>
      <InputGroupTextarea
        autoFocus={draftHero}
        id={inputId}
        name="message"
        aria-describedby={feedbackId}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => submitOnEnter(event, unavailable || (!uncertain && !draft.trim()))}
        placeholder={`Message ${agentName}…`}
        rows={1}
        value={draft}
        xstyle={[sharedStyles.composerControl, sharedStyles.composerField]}
      />
      <InputGroupAddon align="block-end">
        {sessionSelected ? <ModelPicker acceptedEffort={acceptedEffort}
          disabled={!connected || recovering || modelChangePending || modelsPending}
          models={models} onEffortChange={onEffortChange} onEffortError={onEffortError}
          onSelect={onModelSelect} selectedModel={selectedModel} side="top"/>
          : <span {...stylex.props(sharedStyles.composerDefault)}>Agent defaults</span>}
        <div {...stylex.props(sharedStyles.composerActions)}>
          {working || stopping ? <InputGroupButton aria-label="Stop Prime Agent" title="Stop current work"
            disabled={!connected || stopping} onClick={() => { void stopAction() }} size="sm" type="button" variant="ghost">
            <SquareIcon {...stylex.props(sharedStyles.controlIcon)}/><span>{stopping ? "Stopping…" : "Stop"}</span>
          </InputGroupButton> : null}
          <InputGroupButton aria-label={uncertain ? "Check send" : working ? "Queue follow-up" : "Send message"}
            title={uncertain ? "Check send" : working ? "Queue follow-up" : "Send message"} disabled={(!uncertain && !draft.trim()) || unavailable}
            size={uncertain ? "sm" : "icon-sm"} type="submit" variant="default" xstyle={[sharedStyles.composerAction]}>
            {uncertain ? <span>Check send</span> : <ArrowUpIcon {...stylex.props(sharedStyles.controlIcon)}/>}
          </InputGroupButton>
        </div>
      </InputGroupAddon>
    </InputGroup>
    <div id={feedbackId} {...stylex.props(sharedStyles.composerFeedback)}>
      {message ? <p role={feedback?.status === "error" ? "alert" : "status"} {...stylex.props(feedback?.status === "error" && sharedStyles.composerError)}>{message}</p> : null}
      {uncertain && releaseSend ? <><p>Your next action checks the original send. Sending again may duplicate it.</p><button type="button" disabled={unavailable} onClick={() => { void releaseSend() }}>I’ve checked; allow a new send</button></> : null}
      {opening ? <p role="status">Opening conversation… You can keep writing.</p>
        : working && connected && !recovering && !uncertain ? <p>Sent messages are queued after the current work.</p>
        : !connected || recovering ? <p>You can keep writing. New messages need a connection.</p> : null}
    </div>
  </form>
}
function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>, unavailable: boolean) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
  event.preventDefault()
  if (!unavailable) event.currentTarget.form?.requestSubmit()
}
