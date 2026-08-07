import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { AgentEvent } from "../../shared/contract";
import {
  makeAssistantStreamController,
  transcriptReducer,
  type AssistantStreamController,
  type FrameScheduler,
} from "./transcript";

const browserFrameScheduler: FrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => window.cancelAnimationFrame(handle),
};

export function safeAgentErrorMessage(source: string): string {
  return source === "workspace_catalog"
    ? "Unable to refresh the workspace. Check the workspace connection and try again."
    : "Prime Agent encountered an error. Check the connection and try again.";
}

/** Connects normalized agent events to the frame-coalesced transcript domain. */
export function useTranscript() {
  const [items, dispatch] = useReducer(transcriptReducer, []);
  const [announcement, setAnnouncement] = useState({ sequence: 0, text: "" });
  const announce = (text: string) => setAnnouncement((current) => ({ sequence: current.sequence + 1, text }));
  const streamRef = useRef<AssistantStreamController | null>(null);

  if (streamRef.current === null) {
    streamRef.current = makeAssistantStreamController(browserFrameScheduler, {
      makeId: () => crypto.randomUUID(),
      onStart: (id) => dispatch({ type: "start_assistant", id }),
      onAppend: (id, segments) => dispatch({ type: "append_assistant", id, segments }),
      onFinish: (id, segments) => {
        dispatch({ type: "finish_assistant", id, ...(segments ? { segments } : {}) });
        announce("Response completed.");
      },
    });
  }

  useEffect(() => () => streamRef.current?.dispose(), []);

  const handleEvent = useCallback((event: AgentEvent) => {
    const stream = streamRef.current;
    if (stream === null) return;
    if (event.kind === "assistant_message") {
      if (event.phase === "start") stream.start(event.messageId);
      else stream.finish(event.messageId, event.blocks?.map(({ contentIndex, text }) => [contentIndex, text] as const));
      return;
    }
    if (event.kind === "assistant_delta") {
      stream.push(event.messageId, event.contentIndex, event.delta);
      return;
    }
    if (event.kind === "tool") {
      stream.finish();
      dispatch({ type: "tool", id: crypto.randomUUID(), event });
      if (event.phase === "end") announce(`${event.name || "Tool"} ${event.isError ? "failed" : "completed"}.`);
      return;
    }
    if (event.kind === "delegation") {
      stream.finish();
      dispatch({ type: "delegation", id: crypto.randomUUID(), event });
      if (event.status === "done") announce(`${event.name || "Delegated task"} completed.`);
      else if (event.status === "error" || event.status === "cancelled") announce(`${event.name || "Delegated task"} ${event.status}.`);
      return;
    }
    if (event.kind === "lifecycle") {
      if (event.type === "turn_end" || event.type === "agent_end") stream.finish();
      return;
    }
    if (event.kind === "error") {
      const message = safeAgentErrorMessage(event.source);
      stream.finish();
      dispatch({ type: "notice", id: crypto.randomUUID(), text: message, tone: "error" });
      announce(message);
    }
  }, []);

  const appendUser = useCallback((text: string) => {
    streamRef.current?.finish();
    dispatch({ type: "append_user", id: crypto.randomUUID(), text });
  }, []);

  const finish = useCallback(() => streamRef.current?.finish(), []);

  const reset = useCallback(() => {
    streamRef.current?.dispose();
    dispatch({ type: "reset" });
    setAnnouncement((current) => ({ sequence: current.sequence + 1, text: "" }));
  }, []);

  return { items, announcement, handleEvent, appendUser, finish, reset } as const;
}
