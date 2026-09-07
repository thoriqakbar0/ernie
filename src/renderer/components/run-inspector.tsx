import { PythonSource } from "./python-source"
import { memo, useState } from "react"
import Scritto from "@scritto/react"
import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"
import type { describeConversationActivity } from "../conversation-activity"

type Runs = ReturnType<typeof describeConversationActivity>["results"]
const transition = { duration: 220 }
const styles = stylex.create({
  content: {
    alignContent: "start",
    display: "grid",
    flex: 1,
    gap: 16,
    minHeight: 0,
    overflowWrap: "anywhere",
    overflowY: "auto",
    padding: "0 12px 12px",
  },
  far: { transform: "scaleY(1.4)" },
  heading: {
    alignItems: "center",
    color: theme["--ink"],
    display: "flex",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
    gap: 12,
    justifyContent: "space-between",
    padding: 12,
  },
  map: { minWidth: 0, overflowX: "auto" },
  marker: {
    backgroundColor: "transparent",
    boxShadow: { ":focus-visible": "0 0 0 2px var(--focus)", default: null },
    cursor: "pointer",
    display: "grid",
    flexShrink: 0,
    height: 38,
    placeItems: "center",
    width: { "@media (pointer: coarse)": 24, default: 7 },
  },
  near: { transform: "scaleY(1.85)" },
  output: {
    backgroundColor: theme["--surface-muted"],
    borderRadius: 8,
    color: theme["--ink"],
    fontSize: 13,
    marginTop: 6,
    minWidth: 0,
    overflowWrap: "anywhere",
    padding: 12,
    whiteSpace: "pre-wrap",
  },
  panel: {
    backgroundColor: theme["--surface"],
    borderRadius: 10,
    display: "flex",
    flexDirection: "column",
    height: "min(380px, 46dvh)",
    minWidth: 0,
    overflow: "hidden",
  },
  peak: { transform: "scaleY(2.3)" },
  rail: {
    borderWidth: 0,
    display: "flex",
    margin: 0,
    marginInline: "auto",
    minWidth: 0,
    padding: 0,
    paddingInline: 4,
    width: "max-content",
  },
  selected: { backgroundColor: theme["--ink"], transform: "scaleY(1.6)" },
  tick: {
    "@media (prefers-reduced-motion: reduce)": { transition: "none" },
    backgroundColor: theme["--rule-strong"],
    borderRadius: 1,
    height: 14,
    transform: "scaleY(1)",
    transition: "transform 160ms ease-out",
    width: 3,
  },
})

/** Selection updates content in place; the panel and its scroll container retain identity. */
const RunInspectorComponent = ({ results, active }: { results: Runs; active: boolean }) => {
  const [selected, setSelected] = useState(() => results.length - 1)
  const [hovered, setHovered] = useState<number | null>(null)
  const lastId = results.at(-1)?.id
  const [previous, setPrevious] = useState({ active, lastId, length: results.length })
  if (
    previous.active !== active ||
    previous.lastId !== lastId ||
    previous.length !== results.length
  ) {
    setPrevious({ active, lastId, length: results.length })
    if (active && lastId) {
      setSelected(results.length - 1)
    }
  }
  const result = results[selected]
  return (
    <>
      <div {...stylex.props(styles.map)}>
        <fieldset
          aria-label="Tool runs"
          {...stylex.props(styles.rail)}
          onPointerLeave={() => setHovered(null)}
        >
          {results.map((run, index) => {
            const distance = hovered === null ? -1 : Math.abs(index - hovered)
            return (
              <button
                key={run.id}
                type="button"
                aria-label={`Run ${index + 1}: ${run.name}`}
                aria-pressed={index === selected}
                {...stylex.props(styles.marker)}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch") {
                    setHovered(index)
                    setSelected(index)
                  }
                }}
                onBlur={(event) => {
                  if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) {
                    setHovered(null)
                  }
                }}
                onFocus={() => setHovered(index)}
                onClick={() => setSelected(index)}
                onKeyDown={(event) => {
                  let next: Element | null = null
                  if (event.key === "ArrowRight") {
                    next = event.currentTarget.nextElementSibling
                  } else if (event.key === "ArrowLeft") {
                    next = event.currentTarget.previousElementSibling
                  }
                  if (next instanceof HTMLButtonElement) {
                    event.preventDefault()
                    next.focus()
                    next.click()
                  }
                }}
              >
                <span
                  {...stylex.props(
                    styles.tick,
                    index === selected && styles.selected,
                    distance === 0 && styles.peak,
                    distance === 1 && styles.near,
                    distance === 2 && styles.far,
                  )}
                />
              </button>
            )
          })}
        </fieldset>
      </div>
      {result ? (
        <div {...stylex.props(styles.panel)}>
          <div {...stylex.props(styles.heading)}>
            <strong>
              Run <Scritto value={selected + 1} transition={transition} /> ·{" "}
              {result.name === "ipython" ? "Python" : result.name}
            </strong>
            {result.failed ? <output>Tool error</output> : null}
          </div>
          <div {...stylex.props(styles.content)}>
            {result.code === undefined ? null : (
              <div>
                <p>Code</p>
                <pre aria-label="Python source" {...stylex.props(styles.output)}>
                  <PythonSource source={result.code} />
                </pre>
              </div>
            )}
            <div>
              <p>Output</p>
              <pre aria-label={`${result.name} output`} {...stylex.props(styles.output)}>
                {result.text || (result.pending ? "Waiting for output…" : "No output.")}
              </pre>
            </div>
          </div>
        </div>
      ) : (
        <p>Waiting for tool output.</p>
      )}
    </>
  )
}

export const RunInspector = memo(RunInspectorComponent)
