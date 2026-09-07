import type { ResponseAnnotation } from "../response-annotation"
import { ResponseFeedback } from "./response-feedback"
import { styles as sharedStyles } from "../component-styles"
import * as stylex from "@stylexjs/stylex"
import { useId, useState } from "react"
import type { ReactNode, KeyboardEvent } from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"
import type { PrimeEffort, PrimeModel } from "../../packages/prime-agent"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "./ui/input-group"
import { ModelPicker } from "./model-picker"
import type { ConversationSubmission } from "../conversation-flow"

type PrimeComposerProps = Readonly<{
  footerControl?: ReactNode
  connected: boolean
  opening?: boolean
  annotations?: readonly ResponseAnnotation[]
  onRemoveAnnotation?: (id: string) => void
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

const EMPTY_ANNOTATIONS: readonly ResponseAnnotation[] = []

const submitOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>, unavailable: boolean) => {
  if (
    event.key !== "Enter" ||
    event.shiftKey ||
    event.nativeEvent.isComposing ||
    event.keyCode === 229
  ) {
    return
  }
  event.preventDefault()
  if (!unavailable) {
    event.currentTarget.form?.requestSubmit()
  }
}

const getFeedbackMessage = (feedback: ConversationSubmission | undefined, working: boolean) => {
  switch (feedback?.status) {
    case "error":
    case "unknown": {
      return feedback.message
    }
    case "creating": {
      return "Starting conversation…"
    }
    case "sending": {
      return "Sending message…"
    }
    case "queued": {
      return working ? "Queued after the current work." : undefined
    }
    default: {
      break
    }
  }
}

const getConnectionMessage = (opening: boolean, connected: boolean, recovering: boolean) => {
  if (opening) {
    return (
      <p>
        <output>Opening conversation… You can keep writing.</output>
      </p>
    )
  }
  if (!connected || recovering) {
    return <p>You can keep writing. New messages need a connection.</p>
  }
  return null
}

const ComposerActions = ({
  connected,
  working,
  stopping,
  stopAction,
  uncertain,
  sendDisabled,
}: Pick<PrimeComposerProps, "connected" | "working" | "stopping" | "stopAction"> & {
  uncertain: boolean
  sendDisabled: boolean
}) => {
  let sendLabel = "Send message"
  if (uncertain) {
    sendLabel = "Check send"
  } else if (working) {
    sendLabel = "Queue follow-up"
  }
  return (
    <div {...stylex.props(sharedStyles.composerActions)}>
      {working || stopping ? (
        <InputGroupButton
          aria-label="Stop Prime Agent"
          title="Stop current work"
          disabled={!connected || stopping}
          onClick={() => {
            void stopAction()
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <SquareIcon {...stylex.props(sharedStyles.controlIcon)} />
          <span>{stopping ? "Stopping…" : "Stop"}</span>
        </InputGroupButton>
      ) : null}
      <InputGroupButton
        aria-label={sendLabel}
        title={sendLabel}
        disabled={sendDisabled}
        size={uncertain ? "sm" : "icon-sm"}
        type="submit"
        variant="default"
        xstyle={[sharedStyles.composerAction]}
      >
        {uncertain ? (
          <span>Check send</span>
        ) : (
          <ArrowUpIcon {...stylex.props(sharedStyles.controlIcon)} />
        )}
      </InputGroupButton>
    </div>
  )
}

const ComposerFeedback = ({
  feedbackId,
  feedback,
  message,
  uncertain,
  releaseSend,
  unavailable,
  opening = false,
  connected,
  recovering,
}: Pick<PrimeComposerProps, "feedback" | "releaseSend" | "opening" | "connected" | "recovering"> & {
  feedbackId: string
  message: string | undefined
  uncertain: boolean
  unavailable: boolean
}) => (
  <div id={feedbackId} {...stylex.props(sharedStyles.composerFeedback)}>
    {message ? (
      <p
        role={feedback?.status === "error" ? "alert" : "status"}
        {...stylex.props(feedback?.status === "error" && sharedStyles.composerError)}
      >
        {message}
      </p>
    ) : null}
    {uncertain && releaseSend ? (
      <>
        <p>Your next action checks the original send. Sending again may duplicate it.</p>
        <button
          type="button"
          disabled={unavailable}
          onClick={() => {
            void releaseSend()
          }}
        >
          I’ve checked; allow a new send
        </button>
      </>
    ) : null}
    {getConnectionMessage(opening, connected, recovering)}
  </div>
)

/** Keeps composition editable while creation, attachment, and sending settle. */
export const PrimeComposer = ({
  footerControl,
  connected,
  acceptedEffort,
  draft,
  annotations = EMPTY_ANNOTATIONS,
  onRemoveAnnotation,
  draftHero,
  agentName = "Agent",
  feedback,
  releaseSend,
  modelChangePending,
  models,
  modelsPending,
  onDraftChange,
  onEffortChange,
  onEffortError,
  onModelSelect,
  opening,
  recovering,
  selectedModel,
  sessionSelected,
  stopAction,
  stopping,
  submitAction,
  submitting,
  working,
}: PrimeComposerProps) => {
  const inputId = "chat-message"
  const feedbackId = useId()
  const [focused, setFocused] = useState(false)
  const uncertain = feedback?.status === "unknown"
  const unavailable = submitting || (!uncertain && (!connected || recovering || stopping))
  const message = getFeedbackMessage(feedback, working)
  const sendDisabled = unavailable || (!uncertain && !draft.trim() && !annotations.length)
  // Keep pending feedback urgent while external session selection changes during creation.
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submitAction(new FormData(event.currentTarget))
      }}
      data-chat-composer
      {...stylex.props(sharedStyles.primeComposer, draftHero && sharedStyles.primeComposerHero)}
    >
      {onRemoveAnnotation && annotations.length ? (
        <ResponseFeedback annotations={annotations} onRemove={onRemoveAnnotation} />
      ) : null}
      <InputGroup xstyle={[sharedStyles.composerGroup]}>
        <label htmlFor={inputId} {...stylex.props(sharedStyles.srOnly)}>
          Message {agentName}
        </label>
        <InputGroupTextarea
          autoFocus={draftHero}
          id={inputId}
          name="message"
          aria-describedby={feedbackId}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => submitOnEnter(event, sendDisabled)}
          placeholder={`Message ${agentName}…`}
          rows={1}
          value={draft}
          xstyle={[sharedStyles.composerControl, sharedStyles.composerField]}
        />
        <InputGroupAddon align="block-end">
          {footerControl ??
            (sessionSelected ? (
              <ModelPicker
                acceptedEffort={acceptedEffort}
                disabled={!connected || recovering || modelChangePending || modelsPending}
                models={models}
                onEffortChange={onEffortChange}
                onEffortError={onEffortError}
                onSelect={onModelSelect}
                selectedModel={selectedModel}
                side="top"
              />
            ) : (
              <span {...stylex.props(sharedStyles.composerDefault)}>Agent defaults</span>
            ))}
          <ComposerActions
            connected={connected}
            working={working}
            stopping={stopping}
            stopAction={stopAction}
            uncertain={uncertain}
            sendDisabled={sendDisabled}
          />
        </InputGroupAddon>
      </InputGroup>
      <p
        aria-hidden="true"
        {...stylex.props(sharedStyles.composerHint, focused && sharedStyles.composerHintVisible)}
      >
        Enter to send · Shift+Enter for newline
      </p>
      <ComposerFeedback
        feedbackId={feedbackId}
        feedback={feedback}
        message={message}
        uncertain={uncertain}
        releaseSend={releaseSend}
        unavailable={unavailable}
        opening={opening}
        connected={connected}
        recovering={recovering}
      />
    </form>
  )
}
