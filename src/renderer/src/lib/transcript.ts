import type { AgentEvent } from "../../../shared/contract";

/** One ordered, renderer-owned transcript record. */
export type ThreadItem =
  | { readonly id: string; readonly kind: "user"; readonly text: string; readonly steered: boolean }
  | { readonly id: string; readonly kind: "assistant"; readonly segments: readonly string[]; readonly active: boolean }
  | { readonly id: string; readonly kind: "tool"; readonly callId: string; readonly name: string; readonly detail: string; readonly phase: "start" | "update" | "end"; readonly isError: boolean }
  | { readonly id: string; readonly kind: "ipython_execution"; readonly callId: string; readonly executionTarget: "local" | "modal" | "unknown"; readonly status: "running" | "succeeded" | "failed" | "aborted"; readonly code: string; readonly detail: string; readonly startedAt: number | null; readonly durationMs: number | null }
  | { readonly id: string; readonly kind: "delegation"; readonly childId: string; readonly activeSessionId?: string; readonly name: string; readonly task: string; readonly status: "queued" | "running" | "done" | "error" | "cancelled"; readonly detail: string; readonly startedAt: number; readonly updatedAt: number }
  | { readonly id: string; readonly kind: "notice"; readonly text: string; readonly tone: "neutral" | "error" };

/** Closed set of legal transcript state transitions. */
export type TranscriptAction =
  | { readonly type: "append_user"; readonly id: string; readonly text: string; readonly steered: boolean }
  | { readonly type: "start_assistant"; readonly id: string }
  | { readonly type: "append_assistant"; readonly id: string; readonly segments: ReadonlyArray<readonly [number, string]> }
  | { readonly type: "finish_assistant"; readonly id: string; readonly segments?: ReadonlyArray<readonly [number, string]> }
  | { readonly type: "tool"; readonly id: string; readonly event: Extract<AgentEvent, { readonly kind: "tool" }> }
  | { readonly type: "delegation"; readonly id: string; readonly observedAt: number; readonly event: Extract<AgentEvent, { readonly kind: "delegation" }> }
  | { readonly type: "notice"; readonly id: string; readonly text: string; readonly tone: "neutral" | "error" }
  | { readonly type: "reset" };

/** Projects ordered assistant text blocks into display text. */
export function assistantText(item: Extract<ThreadItem, { readonly kind: "assistant" }>): string {
  return item.segments.join("");
}

/** Applies one deterministic transcript transition without mutating prior state. */
export function transcriptReducer(items: readonly ThreadItem[], action: TranscriptAction): readonly ThreadItem[] {
  switch (action.type) {
    case "append_user":
      return [...items, { id: action.id, kind: "user", text: action.text, steered: action.steered }];
    case "start_assistant": {
      const existing = items.findIndex((item) => item.kind === "assistant" && item.id === action.id);
      if (existing >= 0) return items.map((item, index) => index === existing && item.kind === "assistant" ? { ...item, active: true } : item);
      return [...items, { id: action.id, kind: "assistant", segments: [], active: true }];
    }
    case "append_assistant":
      return items.map((item) => {
        if (item.kind !== "assistant" || item.id !== action.id) return item;
        const segments = [...item.segments];
        for (const [contentIndex, delta] of action.segments) {
          segments[contentIndex] = `${segments[contentIndex] ?? ""}${delta}`;
        }
        return { ...item, segments };
      });
    case "finish_assistant":
      return items.map((item) => {
        if (item.kind !== "assistant" || item.id !== action.id) return item;
        if (action.segments === undefined) return { ...item, active: false };
        const segments: string[] = [];
        for (const [contentIndex, text] of action.segments) segments[contentIndex] = text;
        return { ...item, segments, active: false };
      });
    case "tool": {
      const execution = action.event.ipython;
      if (execution !== undefined) {
        const index = items.findIndex((item) => item.kind === "ipython_execution" && item.callId === action.event.callId);
        const previous = index >= 0 && items[index]?.kind === "ipython_execution" ? items[index] : null;
        const next: ThreadItem = {
          id: previous?.id ?? action.id,
          kind: "ipython_execution",
          callId: action.event.callId,
          executionTarget: execution.executionTarget,
          status: execution.status,
          code: execution.code || previous?.code || "",
          detail: execution.detail || previous?.detail || "",
          startedAt: execution.startedAt,
          durationMs: execution.durationMs,
        };
        return index < 0 ? [...items, next] : items.map((item, itemIndex) => itemIndex === index ? next : item);
      }
      const index = items.findIndex((item) => item.kind === "tool" && item.callId === action.event.callId);
      const previous = index >= 0 && items[index]?.kind === "tool" ? items[index] : null;
      const next: ThreadItem = {
        id: previous?.id ?? action.id,
        kind: "tool",
        callId: action.event.callId,
        name: action.event.name || previous?.name || "Tool",
        detail: action.event.detail,
        phase: action.event.phase,
        isError: action.event.isError,
      };
      return index < 0 ? [...items, next] : items.map((item, itemIndex) => itemIndex === index ? next : item);
    }
    case "delegation": {
      const index = items.findIndex((item) => item.kind === "delegation" && item.childId === action.event.childId);
      const previous = index >= 0 && items[index]?.kind === "delegation" ? items[index] : null;
      const next: ThreadItem = {
        id: previous?.id ?? action.id,
        kind: "delegation",
        childId: action.event.childId,
        ...(action.event.activeSessionId ? { activeSessionId: action.event.activeSessionId } : previous?.activeSessionId ? { activeSessionId: previous.activeSessionId } : {}),
        name: action.event.name || previous?.name || "Subagent",
        task: action.event.task || previous?.task || "Delegated work",
        status: action.event.status,
        detail: action.event.detail || previous?.detail || "",
        startedAt: previous?.startedAt ?? action.observedAt,
        updatedAt: action.observedAt,
      };
      return index < 0 ? [...items, next] : items.map((item, itemIndex) => itemIndex === index ? next : item);
    }
    case "notice":
      return [...items, { id: action.id, kind: "notice", text: action.text, tone: action.tone }];
    case "reset":
      return [];
  }
}

/** Injectable animation-frame boundary used to make stream timing testable. */
export interface FrameScheduler {
  readonly request: (callback: () => void) => number;
  readonly cancel: (handle: number) => void;
}

/** State transitions emitted by the frame-coalesced stream controller. */
export interface AssistantStreamCallbacks {
  readonly makeId: () => string;
  readonly onStart: (id: string) => void;
  readonly onAppend: (id: string, segments: ReadonlyArray<readonly [number, string]>) => void;
  readonly onFinish: (id: string, segments?: ReadonlyArray<readonly [number, string]>) => void;
}

/** Owns one active assistant message and batches its deltas per presented frame. */
export interface AssistantStreamController {
  readonly start: (messageId?: string) => void;
  readonly push: (messageId: string, contentIndex: number, delta: string) => void;
  readonly flush: () => void;
  readonly finish: (messageId?: string, segments?: ReadonlyArray<readonly [number, string]>) => void;
  readonly dispose: () => void;
}

/** Creates a controller that preserves message/block identity while coalescing text deltas. */
export function makeAssistantStreamController(
  scheduler: FrameScheduler,
  callbacks: AssistantStreamCallbacks,
): AssistantStreamController {
  let activeId: string | null = null;
  let scheduledFrame: number | null = null;
  const pending = new Map<number, string>();

  const flushPending = () => {
    if (activeId === null || pending.size === 0) return;
    const segments = [...pending.entries()].sort(([left], [right]) => left - right);
    pending.clear();
    callbacks.onAppend(activeId, segments);
  };

  const cancelScheduledFrame = () => {
    if (scheduledFrame === null) return;
    scheduler.cancel(scheduledFrame);
    scheduledFrame = null;
  };

  const flush = () => {
    cancelScheduledFrame();
    flushPending();
  };

  const finish = (messageId?: string, segments?: ReadonlyArray<readonly [number, string]>) => {
    if (activeId === null && messageId !== undefined) start(messageId);
    if (activeId !== null && messageId !== undefined && activeId !== messageId) {
      finish();
      start(messageId);
    }
    if (activeId === null) return;
    flush();
    const finishedId = activeId;
    activeId = null;
    callbacks.onFinish(finishedId, segments);
  };

  const start = (messageId = callbacks.makeId()) => {
    if (activeId === messageId) return;
    finish();
    activeId = messageId;
    callbacks.onStart(activeId);
  };

  const push = (messageId: string, contentIndex: number, delta: string) => {
    if (delta.length === 0) return;
    if (activeId !== messageId) start(messageId);
    pending.set(contentIndex, `${pending.get(contentIndex) ?? ""}${delta}`);
    if (scheduledFrame !== null) return;
    scheduledFrame = scheduler.request(() => {
      scheduledFrame = null;
      flushPending();
    });
  };

  const dispose = () => {
    cancelScheduledFrame();
    pending.clear();
    activeId = null;
  };

  return { start, push, flush, finish, dispose };
}
