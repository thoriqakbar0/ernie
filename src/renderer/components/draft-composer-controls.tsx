import type { AgentSettings } from "../../packages/agents"
import { usePrimeModels } from "../prime-agent-state"
import { DraftModelPicker } from "./draft-model-picker"
import { InferenceControls } from "./inference-controls"

/** New Agents retain inference defaults in the same draft as their selected model. */
export const DraftComposerControls = ({
  sessionId,
  settings,
  disabled,
  onChange,
}: {
  sessionId: string | undefined
  settings: AgentSettings
  disabled: boolean
  onChange: (settings: AgentSettings) => void
}) => {
  const catalog = usePrimeModels(sessionId)
  const selected = catalog.data?.find(
    (item) => item.provider === settings.provider && item.id === settings.model,
  )
  return (
    <>
      <DraftModelPicker
        sessionId={sessionId}
        provider={settings.provider}
        model={settings.model}
        disabled={disabled}
        onChange={(provider, model) => {
          const next = catalog.data?.find((item) => item.provider === provider && item.id === model)
          const { thinkingLevel, ...rest } = settings
          onChange({
            ...rest,
            model,
            provider,
            ...(thinkingLevel && next?.supportedEfforts?.includes(thinkingLevel)
              ? { thinkingLevel }
              : {}),
          })
        }}
      />
      <InferenceControls
        allowDefault
        supportedEfforts={selected?.supportedEfforts ?? []}
        effort={settings.thinkingLevel}
        depth={settings.rlmMaxDepth}
        disabled={disabled || catalog.isPending}
        onEffortChange={(thinkingLevel) => {
          const { thinkingLevel: previous, ...rest } = settings
          if (previous !== thinkingLevel) {
            onChange({ ...rest, ...(thinkingLevel === undefined ? {} : { thinkingLevel }) })
          }
        }}
        onDepthChange={(rlmMaxDepth) => {
          const { rlmMaxDepth: previous, ...rest } = settings
          if (previous !== rlmMaxDepth) {
            onChange({ ...rest, ...(rlmMaxDepth === undefined ? {} : { rlmMaxDepth }) })
          }
        }}
      />
    </>
  )
}
