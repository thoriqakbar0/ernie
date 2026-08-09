import { useEffect, useState } from "react";
import { assistantText, type ThreadItem } from "../../lib/transcript";
import { IPythonExecutionCard } from "../execution/ipython-execution-card";
import { MarkdownContent } from "../execution/markdown-content";

/** Shared transcript projection for interactive and read-only session chat surfaces. */
function formatElapsed(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function DelegationTraceRow({ item, onOpenTranscript }: {
  readonly item: Extract<ThreadItem, { readonly kind: "delegation" }>;
  readonly onOpenTranscript?: (item: Extract<ThreadItem, { readonly kind: "delegation" }>) => void;
}) {
  const running = item.status === "running" || item.status === "queued";
  const [now, setNow] = useState(() => running ? Date.now() : item.updatedAt);
  useEffect(() => {
    if (!running) { setNow(item.updatedAt); return; }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [item.updatedAt, running]);
  const latestAction = item.detail || (running ? "Working" : item.task || "No result summary");
  return <article className={`chat-delegation-card ${item.status}`} tabIndex={-1}>
    <details className={`chat-delegation ${item.status}`} open={running || item.status === "error"}>
      <summary>
        <span className="chat-delegation-copy"><strong>{item.name}</strong><small>{item.task || "Delegated work"}</small></span>
        <span className="chat-delegation-meta"><span>{item.status}</span><time>{formatElapsed(now - item.startedAt)}</time></span>
        <span className="chat-delegation-latest"><span className="sr-only">Latest action: </span>{latestAction}</span>
      </summary>
      {item.detail && <div className="chat-delegation-detail"><strong>Returned findings</strong><p>{item.detail}</p></div>}
    </details>
    {onOpenTranscript && item.activeSessionId && <button type="button" className="chat-delegation-open" onClick={() => onOpenTranscript(item)}>Open transcript</button>}
  </article>;
}

/** Renders one transcript record and its available trace actions. */
export function TranscriptItem({ item, assistantLabel, assistantSubagentCount = 0, assistantRunningSubagentCount = 0, onShowAssistantHierarchy, onOpenDelegationTranscript }: {
  readonly item: ThreadItem;
  readonly assistantLabel: string;
  readonly assistantSubagentCount?: number;
  readonly assistantRunningSubagentCount?: number;
  readonly onShowAssistantHierarchy?: () => void;
  readonly onOpenDelegationTranscript?: (item: Extract<ThreadItem, { readonly kind: "delegation" }>) => void;
}) {
  switch (item.kind) {
    case "user":
      return <article className="chat-message user"><div className="chat-message-role">{item.steered ? "You steered" : "You"}</div><div className="chat-message-copy"><MarkdownContent source={item.text} /></div></article>;
    case "assistant": {
      const subagentLabel = `${assistantSubagentCount} ${assistantSubagentCount === 1 ? "subagent" : "subagents"}`;
      return <article className="chat-message assistant"><div className="chat-message-role">
        {assistantSubagentCount > 0 && onShowAssistantHierarchy
          ? <button type="button" className={assistantRunningSubagentCount > 0 ? "chat-message-attribution running-subagents" : "chat-message-attribution"} aria-label={`Show ${assistantLabel} with ${subagentLabel}${assistantRunningSubagentCount > 0 ? `, ${assistantRunningSubagentCount} running` : ""} in the trace`} onClick={onShowAssistantHierarchy}>{assistantLabel} <span>with {subagentLabel}</span></button>
          : assistantLabel}
      </div><div className="chat-message-copy"><MarkdownContent source={assistantText(item)} trailing={item.active ? <span className="chat-stream-cursor" aria-label="Streaming" /> : undefined} /></div></article>;
    }
    case "ipython_execution":
      return <IPythonExecutionCard execution={item} />;
    case "tool":
      return <details className={`chat-tool ${item.isError ? "error" : ""}`} open={item.phase !== "end"}>
        <summary><span className="chat-tool-mark" aria-hidden="true" /><strong>{item.name}</strong><span>{item.phase === "end" ? item.isError ? "Failed" : "Completed" : "Running"}</span></summary>
        {item.detail && <pre>{item.detail}</pre>}
      </details>;
    case "delegation":
      return <DelegationTraceRow item={item} {...(onOpenDelegationTranscript ? { onOpenTranscript: onOpenDelegationTranscript } : {})} />;
    case "notice":
      return <div className={`chat-notice ${item.tone}`} role={item.tone === "error" ? "alert" : "status"}>{item.text}</div>;
  }
}
