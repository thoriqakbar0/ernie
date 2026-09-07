import { SubagentActivity } from "./subagent-activity"
import { RunInspector } from "./run-inspector"
import Scritto from "@scritto/react"
import * as stylex from "@stylexjs/stylex"
import { ChevronDownIcon, TerminalIcon } from "lucide-react"
import { useMemo, useState } from "react"
import type { PrimeSessionSnapshot } from "../../packages/prime-agent"
import { describeConversationActivity } from "../conversation-activity"
import { theme } from "../theme.stylex"

const styles = stylex.create({
  activity: {
    backgroundColor: theme["--surface-muted"],
    borderRadius: 14,
    color: theme["--muted"],
    fontSize: 13,
    lineHeight: 1.5,
    width: "100%",
  },
  body: {
    display: "grid",
    gap: 4,
    gridTemplateColumns: "minmax(0, 1fr)",
    minWidth: 0,
    padding: "0 12px 12px",
  },
  count: { fontSize: 12, fontVariantNumeric: "tabular-nums" },
  focus: {
    boxShadow: { ":focus-visible": "0 0 0 2px var(--focus)", default: null },
  },
  heading: { color: theme["--ink"], flex: 1, fontWeight: 500, minWidth: 100 },
  queue: { color: theme["--ink"] },
  queuedMessage: { overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
  summary: {
    alignItems: "center",
    boxShadow: { ":focus-visible": "0 0 0 2px var(--focus)", default: null },
    cursor: "pointer",
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    minHeight: 44,
    overflowWrap: "anywhere",
    padding: "12px 14px",
  },
})

/** Compact, session-scoped execution evidence within the conversation scroll area. */
export const ConversationActivity = ({ snapshot }: { snapshot: PrimeSessionSnapshot }) => {
  const activity = useMemo(() => describeConversationActivity(snapshot), [snapshot])
  const [disclosure, setDisclosure] = useState({
    active: activity.active,
    expanded: activity.active,
  })
  if (disclosure.active !== activity.active) {
    setDisclosure({ active: activity.active, expanded: activity.active || disclosure.expanded })
  }
  const followUps = useMemo(() => {
    const occurrences = new Map<string, number>()
    return activity.followUps.map((text) => {
      // Equal text has no distinct identity in the snapshot; retain each occurrence.
      const occurrence = occurrences.get(text) ?? 0
      occurrences.set(text, occurrence + 1)
      return { id: JSON.stringify([text, occurrence]), text }
    })
  }, [activity.followUps])
  let heading: string | undefined = activity.responseStatus ?? "Ready"
  if (activity.active || (activity.summary && activity.summary !== "Execution details")) {
    heading = activity.summary
  }
  if (!activity.summary && !activity.queued && !activity.children.length) {
    return null
  }
  return (
    <details
      open={disclosure.expanded}
      onToggle={(event) =>
        setDisclosure({ active: activity.active, expanded: event.currentTarget.open })
      }
      {...stylex.props(styles.activity)}
    >
      <summary {...stylex.props(styles.summary, styles.focus)}>
        <TerminalIcon size={16} aria-hidden="true" />
        <span {...stylex.props(styles.heading)}>{heading}</span>
        <span {...stylex.props(styles.count)}>
          <Scritto value={activity.results.length} />{" "}
          {activity.results.length === 1 ? "execution" : "executions"}
        </span>
        <ChevronDownIcon size={14} aria-hidden="true" />
        {activity.queued > 0 ? (
          <span {...stylex.props(styles.queue)}>{activity.queued} queued</span>
        ) : null}
      </summary>
      <div {...stylex.props(styles.body)}>
        {activity.phase ? <p>Current phase: {activity.phase}</p> : null}
        {activity.tools.length ? <p>Active tools: {activity.tools.join(", ")}</p> : null}
        {followUps.map(({ id, text }) => (
          <p key={id} {...stylex.props(styles.queuedMessage)}>
            Queued follow-up: {text}
          </p>
        ))}
        <SubagentActivity snapshot={snapshot} />
        {activity.results.length ? (
          <RunInspector results={activity.results} active={activity.active} />
        ) : null}
      </div>
    </details>
  )
}
