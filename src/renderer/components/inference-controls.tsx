import { BrainIcon } from "lucide-react"
import { Tabs } from "@base-ui/react/tabs"
import * as stylex from "@stylexjs/stylex"
import type { PrimeEffort } from "../../packages/prime-agent"
import { DepthSlider } from "./depth-slider"
import { ComposerSelect } from "./composer-select"
import { modelSettingsPanelStyles } from "./model-settings-panel.styles"

const efforts: readonly PrimeEffort[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"]

/** Capability-driven effort and per-chat recursion presets retain the accepted values. */
export const InferenceControls = ({
  supportedEfforts,
  effort,
  effortDescription,
  depth,
  disabled,
  allowDefault = false,
  modelName,
  onEffortChange,
  onDepthChange,
}: {
  supportedEfforts: readonly string[]
  effort: string | undefined
  effortDescription?: string
  depth: number | undefined
  disabled: boolean
  allowDefault?: boolean
  modelName?: string
  onEffortChange: (effort?: PrimeEffort) => void
  onDepthChange: (depth?: number) => void
}) => {
  const available = efforts.filter((item) => supportedEfforts.includes(item))
  const effortOptions = available.map((item) => ({
    label: item.charAt(0).toUpperCase() + item.slice(1),
    value: item,
  }))
  const defaults = allowDefault
    ? [
        {
          label: modelName ? `Use ${modelName} settings` : "Use the selected model’s settings",
          value: "default",
        },
      ]
    : []
  const defaultValue = allowDefault ? "default" : undefined
  return (
    <>
      <Tabs.Panel value="reasoning" {...stylex.props(modelSettingsPanelStyles.panel)}>
        <ComposerSelect
          label="Reasoning"
          compact
          icon={BrainIcon}
          description={`How much reasoning effort the model uses. ${effortDescription ?? "Applies when this conversation starts."}`}
          value={effort ?? defaultValue}
          options={[...defaults, ...effortOptions]}
          disabled={disabled || available.length === 0}
          placeholder={available.length ? "Default" : "Unavailable"}
          onChange={(value) => {
            if (value === "default") {
              onEffortChange()
            } else {
              const accepted = available.find((item) => item === value)
              if (accepted) {
                onEffortChange(accepted)
              }
            }
          }}
        />
      </Tabs.Panel>
      <Tabs.Panel value="depth" {...stylex.props(modelSettingsPanelStyles.panel)}>
        <DepthSlider
          key={depth ?? "default"}
          depth={depth}
          disabled={disabled}
          allowDefault={allowDefault}
          onChange={onDepthChange}
        />
      </Tabs.Panel>
    </>
  )
}
