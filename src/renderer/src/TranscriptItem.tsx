import { assistantText, type ThreadItem } from "./transcript";
import { IPythonExecutionCard } from "./IPythonExecutionCard";
import { MarkdownContent } from "./MarkdownContent";

/** Shared transcript projection for interactive and read-only session chat surfaces. */
export function TranscriptItem({ item, assistantLabel, assistantSubagentCount = 0, onShowAssistantHierarchy }: {
  readonly item: ThreadItem;
  readonly assistantLabel: string;
  readonly assistantSubagentCount?: number;
  readonly onShowAssistantHierarchy?: () => void;
}) {
  switch (item.kind) {
    case "user":
      return <article className="chat-message user"><div className="chat-message-role">{item.steered ? "You steered" : "You"}</div><div className="chat-message-copy"><MarkdownContent source={item.text} /></div></article>;
    case "assistant": {
      const subagentLabel = `${assistantSubagentCount} ${assistantSubagentCount === 1 ? "subagent" : "subagents"}`;
      return <article className="chat-message assistant"><div className="chat-message-role">
        {assistantSubagentCount > 0 && onShowAssistantHierarchy
          ? <button type="button" className="chat-message-attribution" aria-label={`Show ${assistantLabel} with ${subagentLabel} in Grouped Agents`} onClick={onShowAssistantHierarchy}>{assistantLabel} <span>with {subagentLabel}</span></button>
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
      return <details className={`chat-delegation ${item.status}`} open={item.status === "running" || item.status === "error"}>
        <summary><span className="chat-delegation-copy"><strong>{item.name}</strong><small>{item.task || "Delegated work"}</small></span><span>{item.status}</span></summary>
        {item.detail && <div className="chat-delegation-detail">{item.detail}</div>}
      </details>;
    case "notice":
      return <div className={`chat-notice ${item.tone}`} role={item.tone === "error" ? "alert" : "status"}>{item.text}</div>;
  }
}
