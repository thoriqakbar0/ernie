import { Accordion } from "@base-ui/react/accordion"
import { ChevronDownIcon, CircleCheckIcon, CircleStopIcon } from "lucide-react"
import { useState } from "react"
import * as stylex from "@stylexjs/stylex"
import { RunInspector } from "./run-inspector"
import type { conversationTurns } from "../conversation-turns"

const styles = stylex.create({
  root: { marginBlock: 0, marginTop: -12, borderBottom: "1px solid var(--rule)", color: "var(--muted)" },
  header: { margin: 0, display: "flex", alignItems: "center", gap: "var(--execution-header-gap, 4px)", flexWrap: "wrap" },
  summary: {
    display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8,
    width: "auto", backgroundColor: "transparent", borderWidth: 0,
    color: "inherit", cursor: "pointer", minHeight: 32, paddingBlock: 4, paddingInline: 0,
    fontSize: 13, fontWeight: 500, textAlign: "start",
    textDecoration: { default: "none", ":hover": "underline" },
    outline: { default: "none", ":focus-visible": "2px solid var(--focus)" },
    outlineOffset: 3,
  },
  chevron: { flexShrink: 0, transition: "transform 200ms ease", "@media (prefers-reduced-motion: reduce)": { transition: "none" } },
  expanded: { transform: "rotate(180deg)" },
  panel: { overflow: "hidden" },
  hiddenRail: { display: "none" },
  content: { display: "grid", minWidth: 0, paddingBottom: 12 },
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
      <Accordion.Trigger aria-label={`${turn.status} · ${turn.runs.length} ${turn.runs.length === 1 ? "execution" : "executions"}`} {...stylex.props(styles.summary)}>
        {turn.status === "Response finished" ? (
          <CircleCheckIcon size={16} aria-hidden="true" />
        ) : turn.status === "Stopped" ? (
          <CircleStopIcon size={16} aria-hidden="true" />
        ) : (
          <span>{turn.status} ·</span>
        )}
        <span>{turn.runs.length} {turn.runs.length === 1 ? "execution" : "executions"}</span>

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
