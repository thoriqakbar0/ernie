import { useRef, useState } from "react"
import {
  usePrimeRecurrentDepth,
  usePrimeSessionActions,
  usePrimeSessionSnapshot,
} from "../prime-agent-state"
import { InferenceControls } from "./inference-controls"

/** Session controls retain accepted daemon values until each command completes. */
export const SessionInferenceControls = ({
  sessionId,
  disabled,
}: {
  sessionId: string
  disabled: boolean
}) => {
  const snapshot = usePrimeSessionSnapshot(sessionId)
  const depth = usePrimeRecurrentDepth(sessionId)
  const actions = usePrimeSessionActions(sessionId)
  const [pending, setPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>()
  const inFlight = useRef(false)
  const change = async (operation: () => Promise<void>) => {
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    setPending(true)
    setErrorMessage(undefined)
    try {
      await operation()
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not update settings. Try again.",
      )
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }
  return (
    <>
      <InferenceControls
        supportedEfforts={snapshot.data?.useful.state.availableThinkingLevels ?? []}
        effort={snapshot.data?.useful.state.thinkingLevel}
        effortDescription="Changing effort also updates Prime Agent’s default."
        depth={depth.data}
        disabled={disabled || pending}
        onEffortChange={(effort) => {
          if (effort !== undefined) {
            void change(() => actions.setEffort(effort))
          }
        }}
        onDepthChange={(value) => {
          if (value !== undefined) {
            void change(async () => {
              await actions.setRecurrentDepth(value)
              await depth.refetch()
            })
          }
        }}
      />
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {depth.isError ? (
        <button
          type="button"
          onClick={() => {
            void depth.refetch()
          }}
        >
          Retry RLM depth
        </button>
      ) : null}
    </>
  )
}
