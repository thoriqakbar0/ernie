import type { SessionTranscriptEvent, SessionTranscriptMessage, SessionTranscriptTool } from "../../shared/sessionTranscript";
import type { AgentEvent } from "../../shared/contract";
import { transcriptReducer, type ThreadItem } from "./transcript";

function messageText(message: SessionTranscriptMessage): string {
  const segments: string[] = [];
  for (const block of message.blocks) segments[block.contentIndex] = block.text;
  return segments.join("");
}

function projectTool(tool: SessionTranscriptTool): Extract<AgentEvent, { readonly kind: "tool" }> {
  return {
    kind: "tool",
    sequence: 0,
    phase: tool.phase,
    callId: tool.callId,
    name: tool.name,
    isError: tool.status === "failed",
    detail: "detail" in tool && typeof tool.detail === "string" ? tool.detail : "",
    ...(tool.ipython && tool.execution ? { ipython: tool.execution } : {}),
  };
}

function projectSnapshot(event: Extract<SessionTranscriptEvent, { readonly kind: "snapshot" }>): readonly ThreadItem[] {
  let items: readonly ThreadItem[] = [];
  for (const item of event.items) {
    if (item.kind === "message") {
      if (item.role === "user") items = transcriptReducer(items, { type: "append_user", id: item.messageId, text: messageText(item) });
      else {
        items = transcriptReducer(items, { type: "start_assistant", id: item.messageId });
        items = transcriptReducer(items, { type: "finish_assistant", id: item.messageId, segments: item.blocks.map((block) => [block.contentIndex, block.text] as const) });
      }
    } else items = transcriptReducer(items, { type: "tool", id: `tool:${item.callId}`, event: projectTool(item) });
  }
  return event.historyTruncated
    ? [{ id: `history:${event.activeSessionId}`, kind: "notice", text: "Earlier session history is not shown.", tone: "neutral" }, ...items]
    : items;
}

/** Reduces one selected-session snapshot or daemon event into renderer transcript rows. */
export function sessionTranscriptReducer(items: readonly ThreadItem[], event: SessionTranscriptEvent): readonly ThreadItem[] {
  switch (event.kind) {
    case "snapshot": return projectSnapshot(event);
    case "assistant_start": return transcriptReducer(items, { type: "start_assistant", id: event.messageId });
    case "assistant_delta": return transcriptReducer(items, { type: "append_assistant", id: event.messageId, segments: [[event.contentIndex, event.delta]] });
    case "assistant_end": return transcriptReducer(items, { type: "finish_assistant", id: event.messageId, segments: event.blocks.map((block) => [block.contentIndex, block.text] as const) });
    case "user_message": return transcriptReducer(items, { type: "append_user", id: event.message.messageId, text: messageText(event.message) });
    case "tool": return transcriptReducer(items, { type: "tool", id: `tool:${event.callId}`, event: projectTool(event) });
    case "closed": return [...items, { id: `closed:${event.activeSessionId}`, kind: "notice", text: "This session is no longer live.", tone: "neutral" }];
  }
}
