import { useId, useRef, useState } from "react"
import * as stylex from "@stylexjs/stylex"

const styles = stylex.create({
  group: {
    alignItems: "center",
    color: "var(--muted)",
    display: "grid",
    fontSize: 12,
    gap: "8px 12px",
    gridTemplateColumns: "minmax(0, 1fr) 58px",
  },
  label: { gridColumn: "1 / -1" },
  number: {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--rule)",
    borderRadius: 6,
    color: "var(--ink)",
    minHeight: 28,
    paddingInline: 5,
    width: 58,
  },
  rail: { minWidth: 0 },
  range: { accentColor: "var(--accent, #855a50)", cursor: "pointer", margin: 0, width: "100%" },
  reset: { color: "var(--muted)", cursor: "pointer", fontSize: 12, justifySelf: "start" },
  ticks: { display: "flex", fontSize: 10, justifyContent: "space-between", paddingInline: 6 },
})

/** Gesture previews are local; after submission the daemon remains the source of truth. */
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
  const [preview, setPreview] = useState<number>()
  const edited = useRef(false)
  const unavailable = disabled || (!allowDefault && depth === undefined)
  const value = preview ?? depth ?? 0
  const maximum = Math.max(5, depth ?? 0)
  const cancel = () => {
    edited.current = false
    setPreview(undefined)
  }
  const submit = (next: number) => {
    cancel()
    if (!unavailable && Number.isSafeInteger(next) && next >= 0 && next !== depth) {
      onChange(next)
    }
  }
  const commit = (next: number) => {
    if (edited.current) {
      submit(next)
    }
  }
  return (
    <div {...stylex.props(styles.group)}>
      <label htmlFor={id} {...stylex.props(styles.label)}>
        RLM depth
      </label>
      <div {...stylex.props(styles.rail)}>
        <input
          id={id}
          type="range"
          min={0}
          max={maximum}
          step={1}
          value={value}
          aria-valuetext={depth === undefined && preview === undefined ? "Default" : String(value)}
          disabled={unavailable}
          onChange={(event) => {
            edited.current = true
            setPreview(event.currentTarget.valueAsNumber)
          }}
          onPointerUp={(event) => commit(event.currentTarget.valueAsNumber)}
          onPointerCancel={cancel}
          onKeyUp={(event) => commit(event.currentTarget.valueAsNumber)}
          onBlur={(event) => commit(event.currentTarget.valueAsNumber)}
          {...stylex.props(styles.range)}
        />
        <div aria-hidden="true" {...stylex.props(styles.ticks)}>
          {(maximum === 5 ? [0, 1, 2, 3, 4, 5] : [0, maximum]).map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
      </div>
      <input
        key={depth ?? "default"}
        type="number"
        aria-label="Exact RLM depth"
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        step={1}
        defaultValue={depth ?? ""}
        placeholder="Default"
        disabled={unavailable}
        onBlur={(event) => {
          const next = event.currentTarget.valueAsNumber
          event.currentTarget.value = String(depth ?? "")
          submit(next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.blur()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            event.currentTarget.value = String(depth ?? "")
            event.currentTarget.blur()
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
          Default
        </button>
      ) : null}
    </div>
  )
}
