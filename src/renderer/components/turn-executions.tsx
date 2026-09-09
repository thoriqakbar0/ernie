import { Accordion } from "@base-ui/react/accordion"
import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"
import * as stylex from "@stylexjs/stylex"
import { RunInspector } from "./run-inspector"
import type { conversationTurns } from "../conversation-turns"

const styles = stylex.create({
  chevron: {
    "@media (prefers-reduced-motion: reduce)": { transition: "none" },
    flexShrink: 0,
    transition: "transform var(--turn-duration, 220ms) ease",
  },
  content: { display: "grid", minWidth: 0, paddingBottom: 12, width: "100%" },
  expanded: { transform: "rotate(180deg)" },
  header: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--execution-header-gap, 4px)",
    margin: 0,
    minWidth: 0,
    width: "100%",
  },
  hiddenRail: { display: "none" },
  panel: {
    "@media (prefers-reduced-motion: reduce)": { transform: "none", transition: "none" },
    height: {
      ":is([data-starting-style], [data-ending-style])": 0,
      default: "var(--accordion-panel-height)",
    },
    minWidth: 0,
    opacity: { ":is([data-starting-style], [data-ending-style])": 0, default: 1 },
    overflow: "hidden",
    transform: {
      ":is([data-starting-style], [data-ending-style])":
        "translateY(calc(-1 * var(--turn-offset, 6px))) scale(var(--turn-scale, .98))",
      default: "none",
    },
    transformOrigin: "top center",
    transition:
      "height var(--turn-duration, 220ms) ease, opacity var(--turn-duration, 220ms) ease, transform var(--turn-duration, 220ms) cubic-bezier(.2,.8,.2,1)",
    width: "100%",
  },
  root: {
    borderBottomColor: "var(--rule)",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    color: "var(--muted)",
    marginBlock: 0,
    marginTop: -12,
    minWidth: 0,
    width: "100%",
  },
  summary: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    boxShadow: { ":focus-visible": "0 0 0 2px var(--focus)", default: "none" },
    color: "inherit",
    cursor: "pointer",
    display: "flex",
    fontSize: 13,
    fontWeight: 500,
    gap: 8,
    justifyContent: "flex-start",
    minHeight: 32,
    outlineStyle: "none",
    paddingBlock: 4,
    paddingInline: 0,
    textAlign: "start",
    textDecorationLine: { ":hover": "underline", default: "none" },
    width: "auto",
  },
})

/** Active work opens automatically; settled turns collapse while remaining inspectable. */
export const TurnExecutions = ({
  turn,
}: {
  turn: ReturnType<typeof conversationTurns>[number]
}) => {
  const [railHost, setRailHost] = useState<HTMLSpanElement | null>(null)
  const [state, setState] = useState({ active: turn.active, open: turn.active })
  if (state.active !== turn.active) {
    setState({ active: turn.active, open: turn.active })
  }
  // An active assistant turn can exist before its first tool call; there is no execution to disclose yet.
  if (turn.runs.length === 0) {
    return null
  }
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
            <Accordion.Trigger
              title={turn.status}
              aria-label={`${turn.status} · ${turn.runs.length} ${turn.runs.length === 1 ? "run" : "runs"}`}
              {...stylex.props(styles.summary)}
            >
              <span>
                {turn.runs.length} {turn.runs.length === 1 ? "run" : "runs"}
              </span>

              <ChevronDownIcon
                size={16}
                aria-hidden="true"
                {...stylex.props(styles.chevron, state.open && styles.expanded)}
              />
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
