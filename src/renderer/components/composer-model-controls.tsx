import { Popover } from "@base-ui/react/popover"
import * as stylex from "@stylexjs/stylex"
import type { PrimeModel } from "../../packages/prime-agent"
import { ModelPicker } from "./model-picker"
import { SessionInferenceControls } from "./session-inference-controls"

const styles = stylex.create({
  popup: {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--rule)",
    borderRadius: 12,
    padding: 16,
    width: "min(360px, calc(100vw - 24px))",
    boxShadow: "0 8px 24px #00000014",
  },
  positioner: { zIndex: 100 },
  controls: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    flexWrap: "wrap",
    gap: 4,
    minWidth: 0,
  },
})

/** Model and accepted per-session inference settings share one wrapping composer row. */
export const ComposerModelControls = ({
  sessionId,
  disabled,
  models,
  selectedModel,
  onSelect,
}: {
  sessionId?: string
  disabled: boolean
  models: readonly PrimeModel[]
  selectedModel: PrimeModel | undefined
  onSelect: (model: PrimeModel) => void
}) => (
  <Popover.Root>
    <Popover.Trigger disabled={disabled}>
      ⚙ {selectedModel?.name ?? "Model settings"}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner
        side="top"
        align="start"
        sideOffset={12}
        {...stylex.props(styles.positioner)}
      >
        <Popover.Popup {...stylex.props(styles.popup)}>
          <div {...stylex.props(styles.controls)}>
            <ModelPicker
              disabled={disabled}
              models={models}
              onSelect={onSelect}
              selectedModel={selectedModel}
              side="top"
            />
            {sessionId ? (
              <SessionInferenceControls key={sessionId} sessionId={sessionId} disabled={disabled} />
            ) : null}
          </div>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
)
