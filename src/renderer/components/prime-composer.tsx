import type { ResponseAnnotation } from "../response-annotation"
import { ResponseFeedback } from "./response-feedback"
import { styles as sharedStyles } from "../component-styles"
import * as stylex from "@stylexjs/stylex"
import { useId } from "react"
import type { ReactNode, KeyboardEvent } from "react"
import { SquareIcon } from "lucide-react"
import type { PrimeModel } from "../../packages/prime-agent"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "./ui/input-group"
import { ComposerModelControls } from "./composer-model-controls"
import type { ConversationSubmission } from "../conversation-flow"

type PrimeComposerProps = Readonly<{
  sessionId?: string
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
  models: readonly PrimeModel[]
  modelsPending: boolean
  onDraftChange: (draft: string) => void
  onModelSelect: (model: PrimeModel) => void
  recovering: boolean
  selectedModel: PrimeModel | undefined
  modelSelected?: boolean
  sessionSelected: boolean
  stopAction?: () => void | Promise<void>
  stopping: boolean
  submitAction: (formData: FormData) => void | Promise<void>
  submitting: boolean
  working: boolean
}>

const EMPTY_ANNOTATIONS: readonly ResponseAnnotation[] = []
const submitOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>, unavailable: boolean) => {
  if (
    event.key !== "Enter" ||
    (event.shiftKey && !event.metaKey && !event.ctrlKey) ||
    event.nativeEvent.isComposing ||
    event.keyCode === 229
  ) {
    return
  }
  event.preventDefault()
  if (!unavailable) {
    const { form } = event.currentTarget
    const delivery = "steer"
    const button = form?.querySelector<HTMLButtonElement>(
      `button[name="delivery"][value="${delivery}"]`,
    )
    if (button && !button.disabled) {
      form?.requestSubmit(button)
    } else {
      form?.requestSubmit()
    }
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
      return working ? "Message accepted." : undefined
    }
    default: {
      break
    }
  }
}

const ComposerActions = ({
  hasContent,
  working,
  stopping,
  connected,
  stopAction,
  uncertain,
  sendDisabled,
  reviewRequired,
}: Pick<PrimeComposerProps, "working" | "stopping" | "connected" | "stopAction"> & {
  hasContent: boolean
  uncertain: boolean
  sendDisabled: boolean
  reviewRequired: boolean
}) => {
  const showStop = Boolean(stopAction) && (working || stopping) && !uncertain
  const showSend = uncertain || !showStop || hasContent
  let label = working ? "Steer" : "Send"
  if (uncertain) {
    label = reviewRequired ? "Review send" : "Check send"
  }
  return (
    <div {...stylex.props(sharedStyles.composerActions)}>
      {showSend ? (
        <InputGroupButton
          type="submit"
          name="delivery"
          value="steer"
          size="sm"
          variant="default"
          disabled={sendDisabled || stopping}
          title={working && !uncertain ? "Guide the current work" : label}
          xstyle={[sharedStyles.composerAction]}
        >
          {label}
        </InputGroupButton>
      ) : null}
      {showStop ? (
        <InputGroupButton
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={!connected || stopping}
          aria-label={stopping ? "Stopping agent" : "Stop agent"}
          title={stopping ? "Stopping agent" : "Stop agent"}
          onClick={() => {
            void stopAction?.()
          }}
        >
          <SquareIcon size={14} aria-hidden="true" />
        </InputGroupButton>
      ) : null}
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
}: Pick<PrimeComposerProps, "feedback" | "releaseSend" | "opening"> & {
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
        <p>
          {feedback?.status === "unknown" && feedback.canCheck === false
            ? "No further receipt is available. Review the conversation before allowing another send."
            : "Check send looks up the original receipt without sending again."}
        </p>
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
    {opening ? (
      <p>
        <output>Opening conversation… You can keep writing.</output>
      </p>
    ) : null}
  </div>
)

const ComposerFooter = ({
  footerControl,
  sessionSelected,
  sessionId,
  connected,
  recovering,
  modelChangePending,
  modelsPending,
  models,
  onModelSelect,
  selectedModel,
}: Pick<
  PrimeComposerProps,
  | "footerControl"
  | "sessionSelected"
  | "sessionId"
  | "connected"
  | "recovering"
  | "modelChangePending"
  | "modelsPending"
  | "models"
  | "onModelSelect"
  | "selectedModel"
>) =>
  footerControl ??
  (sessionSelected ? (
    <ComposerModelControls
      sessionId={sessionId}
      disabled={!connected || recovering || modelChangePending || modelsPending}
      models={models}
      onSelect={onModelSelect}
      selectedModel={selectedModel}
    />
  ) : (
    <span {...stylex.props(sharedStyles.composerDefault)}>Agent defaults</span>
  ))

/** Blocks message entry until Prime Agent is connected while preserving the draft. */
export const PrimeComposer = ({
  sessionId,
  footerControl,
  connected,
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
  onModelSelect,
  opening,
  recovering,
  selectedModel,
  modelSelected = Boolean(selectedModel),
  sessionSelected,
  stopping,
  stopAction,
  submitAction,
  submitting,
  working,
}: PrimeComposerProps) => {
  const inputId = "chat-message"
  const feedbackId = useId()
  const uncertain = feedback?.status === "unknown"
  const reviewRequired = uncertain && feedback.canCheck === false
  const unavailable = submitting || (!uncertain && (!connected || recovering || stopping))
  const message = getFeedbackMessage(feedback, working)
  const sendDisabled =
    reviewRequired ||
    unavailable ||
    (!uncertain && (!modelSelected || (!draft.trim() && !annotations.length)))
  // Keep pending feedback urgent while external session selection changes during creation.
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!sendDisabled) {
          void submitAction(
            new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter),
          )
        }
      }}
      data-chat-composer
      {...stylex.props(sharedStyles.primeComposer, draftHero && sharedStyles.primeComposerHero)}
    >
      {onRemoveAnnotation && annotations.length ? (
        <ResponseFeedback annotations={annotations} onRemove={onRemoveAnnotation} />
      ) : null}
      <InputGroup disabled={!connected} xstyle={[sharedStyles.composerGroup]}>
        <label htmlFor={inputId} {...stylex.props(sharedStyles.srOnly)}>
          Message {agentName}
        </label>
        <InputGroupTextarea
          autoFocus={draftHero}
          id={inputId}
          name="message"
          aria-describedby={feedbackId}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => submitOnEnter(event, sendDisabled)}
          placeholder={`Message ${agentName}…`}
          rows={1}
          value={draft}
          xstyle={[sharedStyles.composerControl, sharedStyles.composerField]}
        />
        <InputGroupAddon align="block-end" xstyle={sharedStyles.composerToolbar}>
          <ComposerFooter
            footerControl={footerControl}
            sessionSelected={sessionSelected}
            sessionId={sessionId}
            connected={connected}
            recovering={recovering}
            modelChangePending={modelChangePending}
            modelsPending={modelsPending}
            models={models}
            onModelSelect={onModelSelect}
            selectedModel={selectedModel}
          />
          <ComposerActions
            connected={connected}
            hasContent={Boolean(draft.trim()) || annotations.length > 0}
            stopping={stopping}
            stopAction={stopAction}
            working={working}
            uncertain={uncertain}
            sendDisabled={sendDisabled}
            reviewRequired={reviewRequired}
          />
        </InputGroupAddon>
      </InputGroup>
      <ComposerFeedback
        feedbackId={feedbackId}
        feedback={feedback}
        message={message}
        uncertain={uncertain}
        releaseSend={releaseSend}
        unavailable={unavailable}
        opening={opening}
      />
    </form>
  )
}
