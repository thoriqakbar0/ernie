import { describe, expect, it } from "vitest";
import type { SessionTranscriptEvent } from "../src/shared/sessionTranscript";
import { assistantText } from "../src/renderer/src/transcript";
import { sessionTranscriptReducer } from "../src/renderer/src/session-transcript";

describe("selected session transcript projection", () => {
  it("renders a bounded snapshot with user, assistant, generic tool, and IPython execution rows", () => {
    const event: SessionTranscriptEvent = {
      kind: "snapshot", activeSessionId: "child-active", historyTruncated: true, items: [
        { kind: "message", messageId: "u1", role: "user", steered: false, blocks: [{ contentIndex: 0, text: "Review this" }] },
        { kind: "message", messageId: "a1", role: "assistant", blocks: [{ contentIndex: 0, text: "Working" }] },
        { kind: "tool", callId: "read-1", name: "read", phase: "end", status: "succeeded", detail: "done", ipython: false },
        { kind: "tool", callId: "ipy-1", name: "ipython", phase: "end", status: "succeeded", detail: "1", ipython: true,
          execution: { executionTarget: "local", status: "succeeded", code: "print(1)", detail: "1", startedAt: 10, durationMs: 2 } },
      ],
    };
    const items = sessionTranscriptReducer([], event);
    expect(items.map((item) => item.kind)).toEqual(["notice", "user", "assistant", "tool", "ipython_execution"]);
    expect(items[4]).toMatchObject({ kind: "ipython_execution", callId: "ipy-1", code: "print(1)", detail: "1" });
  });

  it("merges live assistant deltas by selected-session message identity", () => {
    const events: SessionTranscriptEvent[] = [
      { kind: "assistant_start", activeSessionId: "child-active", messageId: "a1" },
      { kind: "assistant_delta", activeSessionId: "child-active", messageId: "a1", contentIndex: 0, delta: "Hel" },
      { kind: "assistant_delta", activeSessionId: "child-active", messageId: "a1", contentIndex: 0, delta: "lo" },
      { kind: "assistant_end", activeSessionId: "child-active", messageId: "a1", blocks: [{ contentIndex: 0, text: "Hello" }] },
    ];
    const items = events.reduce(sessionTranscriptReducer, []);
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item?.kind === "assistant" ? assistantText(item) : null).toBe("Hello");
    expect(item?.kind === "assistant" ? item.active : null).toBe(false);
  });

  it("preserves a renderer-known steer admission on a live user message", () => {
    const items = sessionTranscriptReducer([], {
      kind: "user_message",
      activeSessionId: "owned-session",
      message: { kind: "message", messageId: "u-steer", role: "user", steered: true, blocks: [{ contentIndex: 0, text: "Change direction" }] },
    });
    expect(items).toEqual([{ id: "u-steer", kind: "user", text: "Change direction", steered: true }]);
  });
});
