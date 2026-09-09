import { Accordion } from "@base-ui/react/accordion"
import { ChevronDownIcon, CircleStopIcon, SquareCheckIcon, TerminalIcon } from "lucide-react"
import { useState } from "react"
import * as stylex from "@stylexjs/stylex"
import { RunInspector } from "./run-inspector"
import type { conversationTurns } from "../conversation-turns"

const styles = stylex.create({
  root: { marginBlock: 0, marginTop: -12, borderBottom: "1px solid var(--rule)", color: "var(--muted)", minWidth: 0, width: "100%" },
  header: { margin: 0, display: "flex", alignItems: "center", gap: "var(--execution-header-gap, 4px)", flexWrap: "wrap", minWidth: 0, width: "100%" },
  summary: {
    display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8,
    width: "auto", backgroundColor: "transparent", borderWidth: 0,
    color: "inherit", cursor: "pointer", minHeight: 32, paddingBlock: 4, paddingInline: 0,
    fontSize: 13, fontWeight: 500, textAlign: "start",
    textDecoration: { default: "none", ":hover": "underline" },
    outline: { default: "none", ":focus-visible": "2px solid var(--focus)" },
    outlineOffset: 3,
  },
  chevron: { flexShrink: 0, transition: "transform var(--turn-duration, 220ms) ease", "@media (prefers-reduced-motion: reduce)": { transition: "none" } },
  expanded: { transform: "rotate(180deg)" },
  panel: {
    overflow: "hidden",
    minWidth: 0,
    width: "100%",
    height: {
      default: "var(--accordion-panel-height)",
      ":is([data-starting-style], [data-ending-style])": 0,
    },
    opacity: { default: 1, ":is([data-starting-style], [data-ending-style])": 0 },
    transformOrigin: "top center",
    transform: {
      default: "none",
      ":is([data-starting-style], [data-ending-style])": "translateY(calc(-1 * var(--turn-offset, 6px))) scale(var(--turn-scale, .98))",
    },
    transition: "height var(--turn-duration, 220ms) ease, opacity var(--turn-duration, 220ms) ease, transform var(--turn-duration, 220ms) cubic-bezier(.2,.8,.2,1)",
    "@media (prefers-reduced-motion: reduce)": { transition: "none", transform: "none" },
  },
  hiddenRail: { display: "none" },
  content: { display: "grid", minWidth: 0, paddingBottom: 12, width: "100%" },
})

/** Active work opens automatically; settled turns collapse while remaining inspectable. */
export const TurnExecutions = ({
  turn,
}: {
  turn: ReturnType<typeof conversationTurns>[number]
}) => {
  const [railHost, setRailHost] = useState<HTMLSpanElement | null>(null)
  const [state, setState] = useState({ active: turn.active, open: turn.active })
  if (state.active !== turn.active) setState({ active: turn.active, open: turn.active })
  // An active assistant turn can exist before its first tool call; there is no execution to disclose yet.
  if (turn.runs.length === 0) return null
  const StatusIcon =
    turn.status === "Response complete"
      ? SquareCheckIcon
      : turn.status === "Working…"
        ? TerminalIcon
        : turn.status === "Stopped"
          ? CircleStopIcon
          : null
  const iconOnly = turn.status === "Response complete" || turn.status === "Working…"
  return (
    <Accordion.Root<string>
      value={state.open ? ["work"] : []}
      onValueChange={(value) => {
        const open = value.includes("work")
        setState({ active: turn.active, open })
      }}
      {...stylex.props(styles.root)}
    >
      <Accordion.Item value="work">
      <div {...stylex.props(styles.header)}>
      <Accordion.Header {...stylex.props(styles.header)}>
      <Accordion.Trigger aria-label={`${turn.status} · ${turn.runs.length} ${turn.runs.length === 1 ? "run" : "runs"}`} {...stylex.props(styles.summary)}>
        {StatusIcon ? <StatusIcon size={16} aria-hidden="true" /> : null}
        {iconOnly ? null : <span>{turn.status} ·</span>}
        <span>{turn.runs.length} {turn.runs.length === 1 ? "run" : "runs"}</span>

        <ChevronDownIcon size={16} aria-hidden="true" {...stylex.props(styles.chevron, state.open && styles.expanded)} />
      </Accordion.Trigger>
      </Accordion.Header>
      <span ref={setRailHost} {...stylex.props(!state.open && styles.hiddenRail)} />
      </div>
      <Accordion.Panel keepMounted {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.content)}>
        <RunInspector results={turn.runs} active={turn.active} railHost={railHost} />
      </div>
      </Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  )
}
