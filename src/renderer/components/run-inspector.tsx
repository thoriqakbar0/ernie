import { createPortal } from "react-dom"
import { RunSection } from "./run-section"
import { CheckpointSource } from "./checkpoint-source"
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
    gap: "var(--run-section-gap, 8px)",
    minHeight: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
    overflowY: "auto",
    padding: "var(--run-content-padding, 12px) 0",
    width: "100%",
  },
  far: { transform: "scaleY(1.45)", "@media (prefers-reduced-motion: reduce)": { transform: "none" } },
  heading: {
    alignItems: "center",
    color: theme["--ink"],
    display: "flex",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
    gap: 12,
    justifyContent: "space-between",
    padding: "var(--run-heading-padding, 8px) 0",
    width: "100%",
  },
  map: { minWidth: 0, maxWidth: "min(var(--execution-strip-width, 157px), 100%)", width: "max-content", justifySelf: "start", marginInline: 0, overflowX: "auto" },
  marker: {
    backgroundColor: "transparent",
    boxShadow: { ":focus-visible": "0 0 0 2px var(--focus)", default: null },
    cursor: "pointer",
    display: "grid",
    flexShrink: 0,
    height: 34,
    placeItems: "center",
    width: { default: "var(--execution-target-width, 8px)", "@media (pointer: coarse)": 24 },
  },
  near: { transform: "scaleY(2)", "@media (prefers-reduced-motion: reduce)": { transform: "none" } },
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
    borderRadius: "var(--run-radius, 10px)",
    display: "flex",
    flexDirection: "column",
    maxHeight: "min(var(--run-max-height, 380px), 46dvh)",
    minWidth: 0,
    overflow: "hidden",
    width: "100%",
  },
  peak: { transform: "scale(1.3, 2.6)", "@media (prefers-reduced-motion: reduce)": { transform: "none" } },
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
    height: 10,
    transform: "scaleY(1)",
    transition: "transform 180ms cubic-bezier(.2,.8,.2,1)",
    width: 3,
  },
})

/** Selection updates content in place; the panel and its scroll container retain identity. */
const RunInspectorComponent = ({ results, active, railHost }: { results: Runs; active: boolean; railHost?: HTMLElement | null }) => {
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
  const rail = (
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
  )
  return (
    <>
      {railHost ? createPortal(rail, railHost) : rail}
      {result ? (
        <>
          <div {...stylex.props(styles.heading)}>
            <strong>
              Run <Scritto value={selected + 1} transition={transition} />
              {result.name === "ipython" ? null : ` · ${result.name}`}
            </strong>
            <output>
              {result.failed ? "Tool error" : result.pending ? "Running…" : "Finished"}
            </output>
          </div>
          <div {...stylex.props(styles.panel)}>
            <div {...stylex.props(styles.content)}>
              {result.code === undefined ? null : (
                <RunSection key={`code:${result.id}`} title="Code">
                  <pre aria-label="Python source" {...stylex.props(styles.output)}>
                    <PythonSource source={result.code} />
                  </pre>
                </RunSection>
              )}
              <RunSection key={`output:${result.id}`} title="Output" running={Boolean(result.pending)}>
                <pre aria-label={`${result.name} output`} {...stylex.props(styles.output)}>
                  {result.text ? (
                    <CheckpointSource source={result.text} language="shellsession" />
                  ) : result.pending ? (
                    "Waiting for output…"
                  ) : (
                    "No output."
                  )}
                </pre>
              </RunSection>
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}

export const RunInspector = memo(RunInspectorComponent)
