import { useCallback, useEffect, useReducer, useRef } from "react";
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

/** Connects normalized agent events to the frame-coalesced transcript domain. */
export function useTranscript() {
  const [items, dispatch] = useReducer(transcriptReducer, []);
  const streamRef = useRef<AssistantStreamController | null>(null);

  if (streamRef.current === null) {
    streamRef.current = makeAssistantStreamController(browserFrameScheduler, {
      makeId: () => crypto.randomUUID(),
      onStart: (id) => dispatch({ type: "start_assistant", id }),
      onAppend: (id, segments) => dispatch({ type: "append_assistant", id, segments }),
      onFinish: (id, segments) => dispatch({ type: "finish_assistant", id, ...(segments ? { segments } : {}) }),
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
      return;
    }
    if (event.kind === "delegation") {
      stream.finish();
      dispatch({ type: "delegation", id: crypto.randomUUID(), event });
      return;
    }
    if (event.kind === "lifecycle") {
      if (event.type === "turn_end" || event.type === "agent_end") stream.finish();
      return;
    }
    if (event.kind === "error") {
      dispatch({ type: "notice", id: crypto.randomUUID(), text: event.message, tone: "error" });
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
  }, []);

  return { items, handleEvent, appendUser, finish, reset } as const;
}
