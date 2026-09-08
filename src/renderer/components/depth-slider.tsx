import { useId, useRef, useState } from "react"
import * as stylex from "@stylexjs/stylex"

const styles = stylex.create({
  group: {
    gridColumn: "1 / -1",
    flexWrap: "wrap",
    alignItems: "center",
    display: "flex",
    gap: 8,
    paddingInline: 0,
    fontSize: 12,
    color: "var(--muted)",
  },
  range: { width: 80, cursor: "pointer" },
  intensity: (amount: number) => ({
    accentColor: `color-mix(in oklch, var(--danger) ${amount}%, var(--muted))`,
  }),
  number: {
    width: 58,
    minHeight: 28,
    borderRadius: 6,
    border: "1px solid var(--rule)",
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    paddingInline: 5,
  },
  reset: { color: "var(--muted)", fontSize: 12, cursor: "pointer" },
})

/** Previews depth locally and commits once when a pointer or keyboard adjustment ends. */
export const DepthSlider = ({
  depth,
  disabled,
  allowDefault,
  onChange,
}: {
  depth: number | undefined
  disabled: boolean
  allowDefault: boolean
  onChange: (depth?: number) => void
}) => {
  const id = useId()
  const [value, setValue] = useState(depth ?? 0)
  const [custom, setCustom] = useState(String(depth ?? 0))
  const edited = useRef(false)
  const unavailable = disabled || (!allowDefault && depth === undefined)
  const commitCustom = () => {
    const next = Number(custom)
    if (unavailable || !custom.trim() || !Number.isSafeInteger(next) || next < 0) {
      setCustom(String(value))
      return
    }
    setValue(next)
    if (next !== depth) onChange(next)
  }
  const commit = () => {
    if (!edited.current || disabled) return
    edited.current = false
    if (value !== depth) onChange(value)
  }
  return (
    <div {...stylex.props(styles.group)}>
      <label htmlFor={id}>RLM depth</label>
      <input
        id={id}
        type="range"
        min={0}
        max={Math.max(5, depth ?? 0, value)}
        step={1}
        value={value}
        aria-valuetext={`${value}${value === 0 ? ": subagents disabled" : ""}`}
        title="Maximum subagent nesting. 0 disables subagents."
        disabled={unavailable}
        onChange={(event) => {
          edited.current = true
          setValue(event.currentTarget.valueAsNumber)
          setCustom(event.currentTarget.value)
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        {...stylex.props(styles.range, styles.intensity(Math.min(value / 10, 1) * 100))}
      />
      <input
        type="number"
        aria-label="Custom RLM depth"
        title="Enter a whole number, 0 or greater."
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        step={1}
        value={custom}
        disabled={unavailable}
        onChange={(event) => setCustom(event.currentTarget.value)}
        onBlur={commitCustom}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.blur()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            setCustom(String(value))
          }
        }}
        {...stylex.props(styles.number)}
      />
      {allowDefault && depth !== undefined ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange()}
          {...stylex.props(styles.reset)}
        >
          Use default
        </button>
      ) : null}
    </div>
  )
}
