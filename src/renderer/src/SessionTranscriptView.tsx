import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, UIEvent, WheelEvent } from "react";
import type { WorkspaceAgent } from "../../shared/workspace";
import type { ThreadItem } from "./transcript";
import { AccessibleTranscriptDialog } from "./AccessibleTranscriptDialog";
import { VirtualTranscript } from "./VirtualTranscript";

function sessionStateLabel(agent: WorkspaceAgent, interactive: boolean): string {
  if (agent.status === "working") return "Working";
  if (agent.status === "failed") return "Failed";
  if (agent.status === "completed") return "Completed";
  if (agent.status === "cancelled") return "Cancelled";
  if (agent.status === "disconnected") return "Disconnected";
  if (agent.status === "waiting") return "Waiting";
  return interactive ? "Ready" : "Read only";
}

/** Live transcript surface with an optional interactive composer for the commandable root session. */
export function SessionTranscriptView({ agent, items, state, onRetry, renderItem, interactive = false, footer }: {
  readonly agent: WorkspaceAgent;
  readonly items: readonly ThreadItem[];
  readonly state: "loading" | "reconnecting" | "ready" | "error" | "unavailable";
  readonly onRetry: () => void;
  readonly renderItem: (item: ThreadItem) => ReactNode;
  readonly interactive?: boolean;
  readonly footer?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);
  useLayoutEffect(() => {
    if (!followingRef.current) return;
    requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }, [items]);
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const next = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    followingRef.current = next;
    setFollowing(next);
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY >= 0) return;
    followingRef.current = false;
    setFollowing(false);
  };
  const followLatest = () => {
    followingRef.current = true;
    setFollowing(true);
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const terminal = agent.status === "completed" || agent.status === "cancelled" || agent.status === "failed" || agent.status === "disconnected";
  const statusLabel = state === "loading" ? "Connecting"
    : state === "reconnecting" ? "Reconnecting"
    : state === "error" ? "Connection lost"
    : state === "unavailable" ? "Unavailable"
    : sessionStateLabel(agent, interactive);
  const emptyTitle = state === "loading" ? "Connecting to Prime Agent…"
    : state === "reconnecting" ? "Reconnecting to session…"
    : state === "error" ? "Unable to attach to this live session"
    : state === "unavailable" ? "Prime Agent is unavailable"
    : "No messages yet";
  const emptyCopy = state === "error" ? "The session remains safe and unchanged."
    : state === "reconnecting" ? "Existing messages remain available while Ernie restores live updates."
    : state === "unavailable" ? "Review the recovery details below, then retry when Prime Agent is available."
    : interactive ? "Send a message to start working with Prime Agent."
    : terminal ? "This session has no messages."
    : "Messages will appear here as the session runs.";
  const empty = <section className="session-transcript-empty" role={state === "error" ? "alert" : undefined}>
    <strong>{emptyTitle}</strong><p>{emptyCopy}</p>
    {state === "error" && <button type="button" onClick={onRetry}>Retry connection</button>}
  </section>;
  return <section className="session-transcript-view" aria-label={`${agent.name} transcript`}>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{state === "error" ? "" : `Session status: ${statusLabel}`}</div>
    <div className="session-transcript-body">
      {state === "error" && items.length > 0 && <div className="session-stream-error" role="alert"><span>Live updates stopped.</span><button type="button" onClick={onRetry}>Retry connection</button></div>}
      <VirtualTranscript items={items} scrollRef={scrollRef} busy={state === "ready" && agent.status === "working"} onScroll={onScroll} onWheel={onWheel} renderItem={renderItem} empty={empty} />
      {!following && <button type="button" className="jump-latest session-jump-latest" onClick={followLatest}>Jump to latest</button>}
    </div>
    <AccessibleTranscriptDialog items={items} assistantLabel="Prime Agent" promptLabel="You" visuallyHiddenTrigger />
    {footer}
  </section>;
}
