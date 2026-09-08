import { RunInspector } from "./run-inspector"
import Scritto from "@scritto/react"
import * as stylex from "@stylexjs/stylex"
import { ChevronDownIcon, SquareCheckIcon, TerminalIcon } from "lucide-react"
import { useMemo, useState } from "react"
import type { PrimeSessionSnapshot } from "../../packages/prime-agent"
import {
  describeConversationActivity,
  describeConversationToolResults,
} from "../conversation-activity"
import { theme } from "../theme.stylex"

const expandIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(-6px) scaleY(.94)" },
  to: { opacity: 1, transform: "translateY(0) scaleY(1)" },
})

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
    animationName: expandIn,
    animationDuration: { "@media (prefers-reduced-motion: reduce)": "0ms", default: "220ms" },
    animationTimingFunction: "cubic-bezier(.2,.8,.2,1)",
    transformOrigin: "top center",

    display: "grid",
    gap: 4,
    gridTemplateColumns: "minmax(0, 1fr)",
    minWidth: 0,
    padding: "0 12px 12px",
  },
  preview: {
    display: "block",
    fontSize: 12,
    fontWeight: 400,
    color: theme["--muted"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "100%",
    marginTop: 4,
  },
  command: { fontFamily: "var(--font-mono, monospace)" },
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
  const { structuredMessages, streamingMessage } = snapshot.useful
  const results = useMemo(
    () => describeConversationToolResults(structuredMessages, streamingMessage),
    [structuredMessages, streamingMessage],
  )
  const activity = useMemo(
    () => describeConversationActivity(snapshot, results),
    [snapshot, results],
  )
  const running = activity.active || Boolean(streamingMessage)
  const [disclosure, setDisclosure] = useState({
    active: running,
    streaming: Boolean(streamingMessage),
    expanded: running,
    hasOpened: running,
  })
  if (disclosure.active !== running || disclosure.streaming !== Boolean(streamingMessage)) {
    setDisclosure({
      active: running,
      streaming: Boolean(streamingMessage),
      expanded: running || disclosure.expanded,
      hasOpened: running || disclosure.hasOpened,
    })
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
        setDisclosure({
          active: running,
          streaming: Boolean(streamingMessage),
          expanded: event.currentTarget.open,
          hasOpened: disclosure.hasOpened || event.currentTarget.open,
        })
      }
      {...stylex.props(styles.activity)}
    >
      <summary {...stylex.props(styles.summary, styles.focus)}>
        {activity.responseStatus === "Response complete" && !running ? (
          <SquareCheckIcon size={16} aria-hidden="true" />
        ) : (
          <TerminalIcon size={16} aria-hidden="true" />
        )}
        <span {...stylex.props(styles.heading)}>
          {heading}
          {activity.commandPreview ? (
            <span {...stylex.props(styles.preview, styles.command)}>
              Code · {activity.commandPreview.replaceAll(/\s+/gu, " ").slice(0, 180)}
            </span>
          ) : null}
          {activity.messagePreview ? (
            <span {...stylex.props(styles.preview)}>
              Message · {activity.messagePreview.replaceAll(/\s+/gu, " ").slice(-180)}
            </span>
          ) : null}
        </span>
        <span {...stylex.props(styles.count)}>
          <Scritto value={activity.results.length} />{" "}
          {activity.results.length === 1 ? "execution" : "executions"}
        </span>
        <ChevronDownIcon size={14} aria-hidden="true" />
        {activity.queued > 0 ? (
          <span {...stylex.props(styles.queue)}>{activity.queued} queued</span>
        ) : null}
      </summary>
      {disclosure.hasOpened ? (
        <div {...stylex.props(styles.body)}>
          {activity.phase ? <p>Current phase: {activity.phase}</p> : null}
          {activity.tools.length ? (
            <details>
              <summary>Active tools · {activity.tools.length}</summary>
              <p>{activity.tools.join(", ")}</p>
            </details>
          ) : null}
          {followUps.map(({ id, text }) => (
            <p key={id} {...stylex.props(styles.queuedMessage)}>
              Queued follow-up: {text}
            </p>
          ))}
          {activity.results.length ? (
            <RunInspector results={activity.results} active={running} />
          ) : null}
        </div>
      ) : null}
    </details>
  )
}
