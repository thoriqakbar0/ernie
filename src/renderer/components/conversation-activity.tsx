import { SubagentActivity } from "./subagent-activity"
import { RunInspector } from "./run-inspector"
import Scritto from "@scritto/react"
import * as stylex from "@stylexjs/stylex"
import { ChevronDownIcon, TerminalIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { PrimeSessionSnapshot } from "../../packages/prime-agent"
import { describeConversationActivity } from "../conversation-activity"
import { theme } from "../theme.stylex"

/** Compact, session-scoped execution evidence within the conversation scroll area. */
export function ConversationActivity({ snapshot }: { snapshot: PrimeSessionSnapshot }) {
  const activity = useMemo(() => describeConversationActivity(snapshot), [snapshot])
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { if (activity.active) setExpanded(true) }, [activity.active])
  if (!activity.summary && !activity.queued && !activity.children.length) return null
  return <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} {...stylex.props(styles.activity)}>
    <summary {...stylex.props(styles.summary, styles.focus)}><TerminalIcon size={16} aria-hidden="true"/><span {...stylex.props(styles.heading)}>{activity.active ? activity.summary : activity.summary && activity.summary !== "Execution details" ? activity.summary : activity.responseStatus ?? "Ready"}</span><span {...stylex.props(styles.count)}><Scritto value={activity.results.length}/> {activity.results.length === 1 ? "execution" : "executions"}</span><ChevronDownIcon size={14} aria-hidden="true"/>{activity.queued > 0 ? <span {...stylex.props(styles.queue)}>{activity.queued} queued</span> : null}</summary>
    <div {...stylex.props(styles.body)}>
      {activity.phase ? <p>Current phase: {activity.phase}</p> : null}
      {activity.tools.length ? <p>Active tools: {activity.tools.join(", ")}</p> : null}
      {activity.followUps.map((text, index) => <p key={index} {...stylex.props(styles.queuedMessage)}>Queued follow-up: {text}</p>)}
      <SubagentActivity snapshot={snapshot}/>
      {activity.results.length ? <RunInspector results={activity.results} active={activity.active}/> : null}
    </div>
  </details>
}
const styles = stylex.create({
  activity: { color: theme["--muted"], fontSize: 13, lineHeight: 1.5, width: "100%", borderRadius: 14, backgroundColor: theme["--surface-muted"] },
  summary: { cursor: "pointer", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "12px 14px", minHeight: 44, overflowWrap: "anywhere", outlineOffset: 2, outlineColor: theme["--ink"] },
  heading: { flex: 1, minWidth: 100, color: theme["--ink"], fontWeight: 500 },
  count: { fontVariantNumeric: "tabular-nums", fontSize: 12 },
  queue: { color: theme["--ink"] },
  body: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", minWidth: 0, gap: 4, padding: "0 12px 12px" },
  queuedMessage: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  focus: { outlineStyle: "solid", outlineWidth: { default: 0, ":focus-visible": 2 }, outlineOffset: 2, outlineColor: { default: theme["--ink"], "@media (forced-colors: active)": "Highlight" } },
})
