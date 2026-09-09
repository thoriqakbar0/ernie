import { BrainIcon } from "lucide-react"
import * as stylex from "@stylexjs/stylex"
import type { PrimeEffort } from "../../packages/prime-agent"
import { DepthRail } from "./depth-rail"
import { ComposerSelect } from "./composer-select"

const efforts: readonly PrimeEffort[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"]
const styles = stylex.create({
  controls: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 2, minWidth: 0 },
})

/** Capability-driven effort and per-chat recursion presets retain the accepted values. */
export const InferenceControls = ({
  supportedEfforts,
  effort,
  effortDescription,
  depth,
  disabled,
  allowDefault = false,
  onEffortChange,
  onDepthChange,
}: {
  supportedEfforts: readonly string[]
  effort: string | undefined
  effortDescription?: string
  depth: number | undefined
  disabled: boolean
  allowDefault?: boolean
  onEffortChange: (effort?: PrimeEffort) => void
  onDepthChange: (depth?: number) => void
}) => {
  const available = efforts.filter((item) => supportedEfforts.includes(item))
  const effortOptions = available.map((item) => ({
    label: item.charAt(0).toUpperCase() + item.slice(1),
    value: item,
  }))
  const defaults = allowDefault ? [{ label: "Default", value: "default" }] : []
  const defaultValue = allowDefault ? "default" : undefined
  return (
    <details>
      <summary>
        Reasoning · {effort ?? "Default"} · Depth · {depth ?? "Default"}
      </summary>
      <div {...stylex.props(styles.controls)}>
        <ComposerSelect
          label="Reasoning"
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
        <DepthRail
          value={depth}
          disabled={disabled || (!allowDefault && depth === undefined)}
          onChange={onDepthChange}
        />
        {allowDefault && depth !== undefined ? (
          <button type="button" disabled={disabled} onClick={() => onDepthChange()}>
            Default
          </button>
        ) : null}
      </div>
    </details>
  )
}
