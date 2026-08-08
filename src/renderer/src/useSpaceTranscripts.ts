import { useCallback, useEffect, useReducer, useRef } from "react";
import type { AgentEvent } from "../../shared/contract";
import type { SpaceAgentEvent } from "../../shared/spaceRuntime";
import {
  makeAssistantStreamController,
  transcriptReducer,
  type AssistantStreamController,
  type FrameScheduler,
  type ThreadItem,
  type TranscriptAction,
} from "./transcript";
import { safeAgentErrorMessage } from "./useTranscript";

const browserFrameScheduler: FrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => window.cancelAnimationFrame(handle),
};

type SpaceTranscriptAction = { readonly spaceId: string; readonly action: TranscriptAction };

function spaceTranscriptReducer(
  state: ReadonlyMap<string, readonly ThreadItem[]>,
  input: SpaceTranscriptAction,
): ReadonlyMap<string, readonly ThreadItem[]> {
  const current = state.get(input.spaceId) ?? [];
  const nextItems = transcriptReducer(current, input.action);
  if (nextItems === current) return state;
  const next = new Map(state);
  next.set(input.spaceId, nextItems);
  return next;
}

/** Routes live RPC events and optimistic user messages to their owning Space only. */
export function useSpaceTranscripts() {
  const [itemsBySpace, dispatch] = useReducer(spaceTranscriptReducer, new Map<string, readonly ThreadItem[]>());
  const streams = useRef(new Map<string, AssistantStreamController>());

  const streamFor = useCallback((spaceId: string): AssistantStreamController => {
    const existing = streams.current.get(spaceId);
    if (existing) return existing;
    const created = makeAssistantStreamController(browserFrameScheduler, {
      makeId: () => crypto.randomUUID(),
      onStart: (id) => dispatch({ spaceId, action: { type: "start_assistant", id } }),
      onAppend: (id, segments) => dispatch({ spaceId, action: { type: "append_assistant", id, segments } }),
      onFinish: (id, segments) => dispatch({ spaceId, action: { type: "finish_assistant", id, ...(segments ? { segments } : {}) } }),
    });
    streams.current.set(spaceId, created);
    return created;
  }, []);

  useEffect(() => () => {
    for (const stream of streams.current.values()) stream.dispose();
    streams.current.clear();
  }, []);

  const handleAgentEvent = useCallback((spaceId: string, event: AgentEvent) => {
    const stream = streamFor(spaceId);
    if (event.kind === "assistant_message") {
      if (event.phase === "start") stream.start(event.messageId);
      else stream.finish(event.messageId, event.blocks?.map(({ contentIndex, text }) => [contentIndex, text] as const));
      return;
    }
    if (event.kind === "assistant_delta") { stream.push(event.messageId, event.contentIndex, event.delta); return; }
    if (event.kind === "tool") {
      stream.finish();
      dispatch({ spaceId, action: { type: "tool", id: crypto.randomUUID(), event } });
      return;
    }
    if (event.kind === "delegation") {
      stream.finish();
      dispatch({ spaceId, action: { type: "delegation", id: crypto.randomUUID(), event } });
      return;
    }
    if (event.kind === "lifecycle") {
      if (event.type === "turn_end" || event.type === "agent_end") stream.finish();
      return;
    }
    if (event.kind === "error") {
      const message = safeAgentErrorMessage(event.source);
      stream.finish();
      dispatch({ spaceId, action: { type: "notice", id: crypto.randomUUID(), text: message, tone: "error" } });
    }
  }, [streamFor]);

  const handleEvent = useCallback((envelope: SpaceAgentEvent) => {
    handleAgentEvent(envelope.spaceId, envelope.event);
  }, [handleAgentEvent]);

  const appendUser = useCallback((spaceId: string, text: string) => {
    streamFor(spaceId).finish();
    dispatch({ spaceId, action: { type: "append_user", id: crypto.randomUUID(), text } });
  }, [streamFor]);

  return { itemsBySpace, handleEvent, appendUser } as const;
}
