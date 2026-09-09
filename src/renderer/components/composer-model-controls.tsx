import { ModelSettingsPopover } from "./model-settings-popover"
import * as stylex from "@stylexjs/stylex"
import type { PrimeModel } from "../../packages/prime-agent"
import { ModelPicker } from "./model-picker"
import { SessionInferenceControls } from "./session-inference-controls"

const styles = stylex.create({
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
  <div {...stylex.props(styles.controls)}>
    <ModelSettingsPopover
      label={selectedModel?.label ?? selectedModel?.id ?? "Model settings"}
      disabled={disabled}
    >
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
    </ModelSettingsPopover>
  </div>
)
