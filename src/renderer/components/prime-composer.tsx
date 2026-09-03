import * as stylex from "@stylexjs/stylex"
import { styles } from "./prime-composer.stylex"
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
    <form action={submitAction} {...stylex.props(styles.mxAuto, styles.wFull, styles.maxW3xl)} data-chat-composer>
      <div {...stylex.props(styles.rounded22px, styles.bgZinc30080, styles.pPx, styles.composerShadow, styles.transitionColors, styles.focusWithinBgZinc400, styles.darkBgWhite10, styles.darkShadowNone, styles.darkFocusWithinBgWhite20)}>
        <div {...stylex.props(styles.rounded21px, styles.bgWhite95, styles.px3, styles.pb3, styles.pt3, styles.backdropBlurXl, styles.darkBgZinc95095)}>
          <label {...stylex.props(styles.srOnly)} htmlFor="chat-message">Message Prime Agent</label>
          <textarea
            autoFocus={draftHero}
            {...stylex.props(styles.minH68px, styles.wFull, styles.resizeNone, styles.bgTransparent, styles.px1, styles.text15px, styles.leading6, styles.textZinc900, styles.outlineNone, styles.placeholderTextZinc400, styles.darkTextZinc100, styles.darkPlaceholderTextZinc600)}
            disabled={inputDisabled}
            id="chat-message"
            name="message"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder={working ? "Queue a follow-up..." : "Ask Prime Agent to build something..."}
            rows={2}
            value={draft}
          />
          <div {...stylex.props(styles.mt1, styles.flex, styles.minW0, styles.itemsCenter, styles.justifyBetween, styles.gap3)}>
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
                {...stylex.props(styles.grid, styles.size8, styles.shrink0, styles.placeItemsCenter, styles.roundedFull, styles.bgZinc900, styles.textWhite, styles.transition, styles.hoverBgZinc700, styles.disabledOpacity50, styles.darkBgZinc100, styles.darkTextZinc950, styles.darkHoverBgWhite)}
                disabled={stopping}
                formAction={stopAction}
                type="submit"
              >
                <span {...stylex.props(styles.size25, styles.rounded2px, styles.bgCurrent)} />
              </button>
            ) : (
              <button
                aria-label="Send message"
                {...stylex.props(styles.grid, styles.size8, styles.shrink0, styles.placeItemsCenter, styles.roundedFull, styles.bgZinc900, styles.textWhite, styles.transition, styles.hoverBgZinc700, styles.focusVisibleOutline2, styles.focusVisibleOutlineOffset2, styles.focusVisibleOutlineZinc500, styles.disabledCursorNotAllowed, styles.disabledBgZinc200, styles.disabledTextZinc400, styles.darkBgZinc100, styles.darkTextZinc950, styles.darkHoverBgWhite, styles.darkDisabledBgZinc800, styles.darkDisabledTextZinc600)}
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
    <svg aria-hidden="true" {...stylex.props(styles.size4)} fill="none" viewBox="0 0 16 16">
      <path d="m3 8 5-5 5 5M8 3v10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  )
}
