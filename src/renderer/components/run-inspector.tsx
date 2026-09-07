import { PythonSource } from "./python-source"
import { memo, useEffect, useState } from "react"
import Scritto from "@scritto/react"
import * as stylex from "@stylexjs/stylex"
import { theme } from "../theme.stylex"
import type { describeConversationActivity } from "../conversation-activity"

type Runs = ReturnType<typeof describeConversationActivity>["results"]
const transition = { duration: 220 }
/** Selection updates content in place; the panel and its scroll container retain identity. */
export const RunInspector = memo(function RunInspector({ results, active }: { results: Runs; active: boolean }) {
  const [selected, setSelected] = useState(() => results.length - 1)
  const [hovered, setHovered] = useState<number | null>(null)
  const lastId = results.at(-1)?.id
  useEffect(() => { if (active && lastId) setSelected(results.length - 1) }, [active, lastId, results.length])
  const result = results[selected]
  return <>
    <div {...stylex.props(styles.map)}><div role="group" aria-label="Tool runs" {...stylex.props(styles.rail)} onPointerLeave={() => setHovered(null)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHovered(null) }}>
      {results.map((run, index) => { const distance = hovered === null ? -1 : Math.abs(index - hovered); return <button key={run.id} type="button" aria-label={`Run ${index + 1}: ${run.name}`} aria-pressed={index === selected} {...stylex.props(styles.marker)} onPointerEnter={event => { if (event.pointerType !== "touch") { setHovered(index); setSelected(index) } }} onFocus={() => setHovered(index)} onClick={() => setSelected(index)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? event.currentTarget.nextElementSibling : event.key === "ArrowLeft" ? event.currentTarget.previousElementSibling : null
        if (next instanceof HTMLButtonElement) { event.preventDefault(); next.focus(); next.click() }
      }}><span {...stylex.props(styles.tick, index === selected && styles.selected, distance === 0 && styles.peak, distance === 1 && styles.near, distance === 2 && styles.far)}/></button> })}
    </div></div>
    {result ? <div {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.heading)}><strong>Run <Scritto value={selected + 1} transition={transition}/> · {result.name === "ipython" ? "Python" : result.name}</strong>{result.failed ? <span role="status">Tool error</span> : null}</div>
      <div {...stylex.props(styles.content)}>
        {result.code !== undefined ? <div><p>Code</p><pre aria-label="Python source" {...stylex.props(styles.output)}><PythonSource source={result.code}/></pre></div> : null}
        <div><p>Output</p><pre aria-label={`${result.name} output`} {...stylex.props(styles.output)}>{result.text || (result.pending ? "Waiting for output…" : "No output.")}</pre></div>
      </div>
    </div> : <p>Waiting for tool output.</p>}
  </>
})
const styles = stylex.create({
  map: { overflowX: "auto", minWidth: 0 },
  rail: { display: "flex", width: "max-content", marginInline: "auto", paddingInline: 4 },
  marker: { display: "grid", placeItems: "center", flexShrink: 0, width: { default: 7, "@media (pointer: coarse)": 24 }, height: 38, cursor: "pointer", backgroundColor: "transparent", outlineStyle: "solid", outlineWidth: { default: 0, ":focus-visible": 2 }, outlineColor: theme["--focus"] },
  tick: { width: 3, height: 14, backgroundColor: theme["--rule-strong"], borderRadius: 1, transform: "scaleY(1)", transition: "transform 160ms ease-out", "@media (prefers-reduced-motion: reduce)": { transition: "none" } },
  selected: { backgroundColor: theme["--ink"], transform: "scaleY(1.6)" },
  peak: { transform: "scaleY(2.3)" }, near: { transform: "scaleY(1.85)" }, far: { transform: "scaleY(1.4)" },
  panel: { height: "min(380px, 46dvh)", display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, borderRadius: 10, backgroundColor: theme["--surface"] },
  heading: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 12, flexShrink: 0, color: theme["--ink"], fontVariantNumeric: "tabular-nums" },
  content: { flex: 1, minHeight: 0, overflowY: "auto", display: "grid", alignContent: "start", gap: 16, padding: "0 12px 12px", overflowWrap: "anywhere" },
  output: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", minWidth: 0, marginTop: 6, padding: 12, borderRadius: 8, fontSize: 13, backgroundColor: theme["--surface-muted"], color: theme["--ink"] },
})
