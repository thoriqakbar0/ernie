import * as stylex from "@stylexjs/stylex"
import type { PrimeEffort } from "../../packages/prime-agent"
import { ComposerSelect } from "./composer-select"

const efforts: readonly PrimeEffort[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"]
const depthPresets = [0, 1, 2, 3, 4, 5]
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
  const depths =
    depth !== undefined && !depthPresets.includes(depth)
      ? [...depthPresets, depth].toSorted((left, right) => left - right)
      : depthPresets
  const defaults = allowDefault ? [{ label: "Default", value: "default" }] : []
  const defaultValue = allowDefault ? "default" : undefined
  const depthValue = depth === undefined ? defaultValue : String(depth)
  return (
    <div {...stylex.props(styles.controls)}>
      <ComposerSelect
        label="Effort"
        description={effortDescription}
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
      <ComposerSelect
        label="RLM max depth"
        value={depthValue}
        options={[
          ...defaults,
          ...depths.map((item) => ({ label: String(item), value: String(item) })),
        ]}
        disabled={disabled || (!allowDefault && depth === undefined)}
        placeholder="Loading…"
        onChange={(value) => {
          if (value === "default") {
            onDepthChange()
          } else {
            const accepted = depths.find((item) => String(item) === value)
            if (accepted !== undefined) {
              onDepthChange(accepted)
            }
          }
        }}
      />
    </div>
  )
}
