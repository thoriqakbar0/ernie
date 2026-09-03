import { type CSSProperties, useEffect, useRef, useState } from "react"

type RecurrentDepthSliderProps = Readonly<{
  acceptedDepth: number | undefined
  disabled: boolean
  onChange: (depth: number) => Promise<void>
  onError: (message: string) => void
}>

export function RecurrentDepthSlider({
  acceptedDepth,
  disabled,
  onChange,
  onError,
}: RecurrentDepthSliderProps) {
  const [selectedDepth, setSelectedDepth] = useState(acceptedDepth ?? 1)
  const revision = useRef(0)
  const changeTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (acceptedDepth !== undefined) setSelectedDepth(acceptedDepth)
  }, [acceptedDepth])

  useEffect(() => () => window.clearTimeout(changeTimer.current), [])

  const selectDepth = (depth: number) => {
    setSelectedDepth(depth)
    if (acceptedDepth === undefined || depth === acceptedDepth || disabled) return
    window.clearTimeout(changeTimer.current)
    const currentRevision = revision.current + 1
    revision.current = currentRevision
    changeTimer.current = window.setTimeout(() => {
      void onChange(depth).catch((cause: unknown) => {
        if (revision.current !== currentRevision) return
        setSelectedDepth(acceptedDepth)
        onError(cause instanceof Error ? cause.message : "Prime Agent depth change failed")
      })
    }, 180)
  }

  return (
    <label className="depth-slider">
      <span>depth</span>
      <input
        aria-label="Recurrent depth"
        disabled={disabled || acceptedDepth === undefined}
        max={4}
        min={0}
        onChange={(event) => selectDepth(Number(event.target.value))}
        step={1}
        style={{ "--depth-progress": `${selectedDepth / 4 * 100}%` } as CSSProperties}
        type="range"
        value={selectedDepth}
      />
      <output>{selectedDepth}</output>
    </label>
  )
}
