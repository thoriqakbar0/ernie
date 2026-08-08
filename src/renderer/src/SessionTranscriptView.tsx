import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, UIEvent, WheelEvent } from "react";
import type { WorkspaceAgent } from "../../shared/workspace";
import type { ThreadItem } from "./transcript";
import { VirtualTranscript } from "./VirtualTranscript";
import { AccessibleTranscriptDialog } from "./AccessibleTranscriptDialog";

function sessionStateLabel(agent: WorkspaceAgent, interactive: boolean): string {
  if (agent.status === "working") return "Working";
  if (agent.status === "failed") return "Unavailable";
  if (agent.status === "disconnected") return "Disconnected";
  if (agent.status === "waiting") return "Waiting";
  return interactive ? "Ready" : "Read only";
}

/** Live transcript surface with an optional interactive composer for the commandable root session. */
export function SessionTranscriptView({ agent, items, state, onRetry, renderItem, interactive = false, footer, headerContext }: {
  readonly agent: WorkspaceAgent;
  readonly items: readonly ThreadItem[];
  readonly state: "loading" | "ready" | "error";
  readonly onRetry: () => void;
  readonly renderItem: (item: ThreadItem) => ReactNode;
  readonly interactive?: boolean;
  readonly footer?: ReactNode;
  readonly headerContext?: string;
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
  const empty = <section className="session-transcript-empty" role={state === "error" ? "alert" : "status"}>
    <strong>{state === "loading" ? "Loading session…" : state === "error" ? "Unable to attach to this live session" : "No messages yet"}</strong>
    <p>{state === "error" ? "The session remains safe and unchanged." : interactive ? "Send a message to start working with Prime Agent." : "Messages will appear here as the session runs."}</p>
    {state === "error" && <button type="button" onClick={onRetry}>Retry connection</button>}
  </section>;
  return <section className="session-transcript-view" aria-labelledby="selected-session-title">
    <header className="session-transcript-heading">
      <div><span>{headerContext ?? (agent.runtimeKind === "subagent" ? "Subagent session" : "Agent session")}</span><h1 id="selected-session-title">{agent.name}</h1></div>
      <span className={`session-live-state ${state === "error" ? "failed" : agent.status}`}>{state === "loading" ? "Connecting" : state === "error" ? "Connection lost" : sessionStateLabel(agent, interactive)}</span>
    </header>
    <div className="session-transcript-body">
      <AccessibleTranscriptDialog items={items} assistantLabel={agent.name} promptLabel="Prompt" />
      {state === "error" && items.length > 0 && <div className="session-stream-error" role="alert"><span>Live updates stopped.</span><button type="button" onClick={onRetry}>Retry connection</button></div>}
      <VirtualTranscript items={items} scrollRef={scrollRef} busy={state === "ready" && agent.status === "working"} onScroll={onScroll} onWheel={onWheel} renderItem={renderItem} empty={empty} />
      {!following && <button type="button" className="jump-latest session-jump-latest" onClick={followLatest}>Jump to latest</button>}
    </div>
    {footer ?? <footer className="session-transcript-footer">Read-only session stream</footer>}
  </section>;
}
