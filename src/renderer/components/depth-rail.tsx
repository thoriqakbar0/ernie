import { useState } from "react"
import * as stylex from "@stylexjs/stylex"

const styles = stylex.create({
  row: { display: "flex", alignItems: "center", gap: 12, width: "100%" },
  track: { flex: 1, minWidth: 80, accentColor: "var(--accent, #855a50)" },
  value: {
    width: 56,
    padding: 6,
    border: "1px solid var(--rule)",
    borderRadius: 6,
    backgroundColor: "var(--surface)",
    color: "inherit",
  },
})

/** Preview a gesture locally; submit one depth change when the gesture finishes. */
export const DepthRail = ({
  value,
  disabled,
  onChange,
}: {
  value: number | undefined
  disabled: boolean
  onChange: (value: number) => void
}) => {
  const [preview, setPreview] = useState<number>()
  const shown = preview ?? value ?? 0
  const commit = (next: number) => {
    setPreview(undefined)
    if (Number.isSafeInteger(next) && next >= 0 && next !== value) onChange(next)
  }
  return (
    <div {...stylex.props(styles.row)}>
      <input
        {...stylex.props(styles.track)}
        aria-label="RLM depth"
        type="range"
        min={0}
        max={Math.max(5, value ?? 0)}
        step={1}
        value={shown}
        disabled={disabled}
        onChange={(event) => setPreview(event.currentTarget.valueAsNumber)}
        onPointerUp={(event) => commit(event.currentTarget.valueAsNumber)}
        onPointerCancel={() => setPreview(undefined)}
        onKeyUp={(event) => commit(event.currentTarget.valueAsNumber)}
        onBlur={(event) => commit(event.currentTarget.valueAsNumber)}
      />
      <input
        key={value ?? "default"}
        {...stylex.props(styles.value)}
        aria-label="Exact RLM depth"
        type="number"
        min={0}
        step={1}
        defaultValue={value ?? ""}
        placeholder="—"
        disabled={disabled}
        onBlur={(event) => {
          if (event.currentTarget.value !== "") commit(event.currentTarget.valueAsNumber)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}
