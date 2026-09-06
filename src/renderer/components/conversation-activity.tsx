import * as stylex from "@stylexjs/stylex"
import { ChevronDownIcon, CodeXmlIcon, CheckIcon, CircleAlertIcon, TerminalIcon } from "lucide-react"
import { useMemo } from "react"
import type { PrimeSessionSnapshot } from "../../packages/prime-agent"
import { describeConversationActivity } from "../conversation-activity"
import { theme } from "../theme.stylex"

/** Compact, session-scoped execution evidence within the conversation scroll area. */
export function ConversationActivity({ snapshot }: { snapshot: PrimeSessionSnapshot }) {
  const activity = useMemo(() => describeConversationActivity(snapshot), [snapshot])
  if (!activity.summary && !activity.queued && !activity.children.length) return null
  return <details {...stylex.props(styles.activity)}>
    <summary {...stylex.props(styles.summary, styles.focus)}><TerminalIcon size={16} aria-hidden="true"/><span {...stylex.props(styles.heading)}>{activity.active ? activity.summary : activity.summary && activity.summary !== "Execution details" ? activity.summary : "Executions"}</span><span {...stylex.props(styles.count)}>{activity.results.length} {activity.results.length === 1 ? "execution" : "executions"}</span><ChevronDownIcon size={14} aria-hidden="true"/>{activity.queued > 0 ? <span {...stylex.props(styles.queue)}>{activity.queued} queued</span> : null}</summary>
    <div {...stylex.props(styles.body)}>
      {activity.phase ? <p>Current phase: {activity.phase}</p> : null}
      {activity.tools.length ? <p>Active tools: {activity.tools.join(", ")}</p> : null}
      {activity.followUps.map((text, index) => <p key={index} {...stylex.props(styles.queuedMessage)}>Queued follow-up: {text}</p>)}
      {activity.children.map((child) => <div key={child.id} {...stylex.props(styles.child)}><span>{child.label}</span><span {...stylex.props(styles.badge)}>{child.status}</span>{child.error ? <p>{child.error}</p> : null}</div>)}
      {activity.results.length ? activity.results.map((result, index) => <details key={`${result.id}:${index}`} {...stylex.props(styles.result)}>
        <summary {...stylex.props(styles.resultSummary, styles.focus)}><CodeXmlIcon size={16} aria-hidden="true"/><strong>{result.name === "ipython" || result.name === "python" ? "Python" : result.name}</strong><span {...stylex.props(styles.badge)}>{result.failed ? <CircleAlertIcon size={14} aria-hidden="true"/> : <CheckIcon size={14} aria-hidden="true"/>}{result.failed ? "Tool error" : "Completed"}</span><ChevronDownIcon size={14} aria-hidden="true"/></summary>
        <div {...stylex.props(styles.resultBody)}>
          {result.code !== undefined ? <div><p {...stylex.props(styles.label)}>Code</p><pre tabIndex={0} aria-label="Python source" {...stylex.props(styles.output, styles.focus)}><code>{result.code}</code></pre></div> : null}
          <div><p {...stylex.props(styles.label)}>Output</p>{result.text ? <pre tabIndex={0} aria-label={`${result.name} output`} {...stylex.props(styles.output, styles.focus)}>{result.text}</pre> : <p>No output.</p>}</div>
          {result.failed ? <p>Review the error before retrying.</p> : null}
        </div>
      </details>) : <p>Waiting for tool output.</p>}
    </div>
  </details>
}
const styles = stylex.create({
  activity: { color: theme["--muted"], fontSize: 13, lineHeight: 1.5, width: "100%", borderRadius: 14, backgroundColor: theme["--surface-muted"] },
  summary: { cursor: "pointer", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "12px 14px", minHeight: 44, overflowWrap: "anywhere", outlineOffset: 2, outlineColor: theme["--ink"] },
  heading: { flex: 1, minWidth: 100, color: theme["--ink"], fontWeight: 500 },
  count: { fontVariantNumeric: "tabular-nums", fontSize: 12 },
  queue: { color: theme["--ink"] },
  body: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", minWidth: 0, gap: 16, padding: "4px 12px 12px" },
  queuedMessage: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  child: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, padding: 8, overflowWrap: "anywhere" },
  badge: { display: "inline-flex", alignItems: "center", gap: 4, marginInlineStart: "auto", fontSize: 12, color: theme["--muted"] },
  result: { minWidth: 0, overflowWrap: "anywhere", borderRadius: 10, backgroundColor: theme["--surface"] },
  resultSummary: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: 12, minHeight: 44, cursor: "pointer", color: theme["--ink"], outlineOffset: 2, outlineColor: theme["--ink"] },
  resultBody: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, padding: "0 12px 12px", minWidth: 0 },
  label: { fontSize: 12, fontWeight: 500, marginBottom: 6 },
  output: { whiteSpace: "pre", maxWidth: "100%", maxHeight: 280, overflow: "auto", overscrollBehavior: "contain", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, lineHeight: 1.6, padding: 12, borderRadius: 8, color: theme["--ink"], backgroundColor: theme["--surface-muted"] },
  focus: { outlineStyle: "solid", outlineWidth: { default: 0, ":focus-visible": 2 }, outlineOffset: 2, outlineColor: { default: theme["--ink"], "@media (forced-colors: active)": "Highlight" } },
})
