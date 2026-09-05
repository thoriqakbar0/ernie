import * as stylex from "@stylexjs/stylex"
import { useMemo } from "react"
import type { PrimeSessionSnapshot } from "../../packages/prime-agent"
import { describeConversationActivity } from "../conversation-activity"
import { theme } from "../theme.stylex"

/** Compact, session-scoped execution evidence within the conversation scroll area. */
export function ConversationActivity({ snapshot }: { snapshot: PrimeSessionSnapshot }) {
  const activity = useMemo(() => describeConversationActivity(snapshot), [snapshot])
  if (!activity.summary && !activity.queued && !activity.children.length) return null
  return <details {...stylex.props(styles.activity)}>
    <summary {...stylex.props(styles.summary)}><span>{activity.summary ?? "Execution details"}</span>{activity.queued > 0 ? <span {...stylex.props(styles.queue)}>{activity.queued} queued</span> : null}</summary>
    <div {...stylex.props(styles.body)}>
      {activity.phase ? <p>Current phase: {activity.phase}</p> : null}
      {activity.tools.length ? <p>Active tools: {activity.tools.join(", ")}</p> : null}
      {activity.followUps.map((text, index) => <p key={index} {...stylex.props(styles.queuedMessage)}>Queued follow-up: {text}</p>)}
      {activity.children.map((child) => <p key={child.id}>{child.label} · {child.status}{child.error ? ` · ${child.error}` : ""}</p>)}
      {activity.results.length ? activity.results.map((result, index) => <details key={`${result.id}:${index}`} {...stylex.props(styles.result)}>
        <summary>{result.name}{result.failed ? " · tool error" : " · output"}</summary>
        {result.text ? <pre {...stylex.props(styles.output)}>{result.text}</pre> : <p>No text output is available.</p>}
      </details>) : <p>Tool output appears here when the runtime provides it.</p>}
    </div>
  </details>
}
const styles = stylex.create({
  activity: { color: theme["--muted"], fontSize: 13, lineHeight: 1.6, width: "100%" },
  summary: { cursor: "pointer", paddingBlock: 8, overflowWrap: "anywhere" },
  queue: { marginLeft: 12, color: theme["--ink"] },
  body: { display: "grid", gap: 10, padding: "12px 16px", borderLeftWidth: 2, borderLeftStyle: "solid", borderLeftColor: theme["--rule"] },
  queuedMessage: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  result: { minWidth: 0, overflowWrap: "anywhere" },
  output: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 260, overflow: "auto", fontSize: 12, padding: 12, marginTop: 8, borderRadius: 10, backgroundColor: theme["--surface-muted"] },
})
