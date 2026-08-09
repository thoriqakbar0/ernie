import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  assistantText,
  makeAssistantStreamController,
  transcriptReducer,
  type FrameScheduler,
  type TranscriptAction,
} from "../src/renderer/src/transcript";
import { safeAgentErrorMessage } from "../src/renderer/src/use-transcript";
import { IPythonExecutionCard } from "../src/renderer/src/ipython-execution-card";

function makeHarness() {
  let nextHandle = 0;
  const callbacks = new Map<number, () => void>();
  const events: Array<readonly [string, unknown]> = [];
  const scheduler: FrameScheduler = {
    request: (callback) => {
      nextHandle += 1;
      callbacks.set(nextHandle, callback);
      return nextHandle;
    },
    cancel: (handle) => { callbacks.delete(handle); },
  };
  let id = 0;
  const controller = makeAssistantStreamController(scheduler, {
    makeId: () => `assistant-${++id}`,
    onStart: (assistantId) => { events.push(["start", assistantId]); },
    onAppend: (assistantId, segments) => { events.push(["append", { assistantId, segments }]); },
    onFinish: (assistantId) => { events.push(["finish", assistantId]); },
  });
  const present = () => {
    const scheduled = [...callbacks.values()];
    callbacks.clear();
    for (const callback of scheduled) callback();
  };
  return { controller, events, callbacks, present };
}

describe("assistant stream controller", () => {
  it("coalesces arbitrary deltas into one presented-frame update", () => {
    const harness = makeHarness();
    for (let index = 0; index < 1_000; index += 1) harness.controller.push("assistant-1", 0, "x");

    expect(harness.callbacks.size).toBe(1);
    expect(harness.events).toEqual([["start", "assistant-1"]]);
    harness.present();
    expect(harness.events).toEqual([
      ["start", "assistant-1"],
      ["append", { assistantId: "assistant-1", segments: [[0, "x".repeat(1_000)]] }],
    ]);
  });

  it("preserves content-index ordering and flushes before a boundary", () => {
    const harness = makeHarness();
    harness.controller.push("assistant-1", 2, "after");
    harness.controller.push("assistant-1", 0, "before");
    harness.controller.finish();

    expect(harness.callbacks.size).toBe(0);
    expect(harness.events).toEqual([
      ["start", "assistant-1"],
      ["append", { assistantId: "assistant-1", segments: [[0, "before"], [2, "after"]] }],
      ["finish", "assistant-1"],
    ]);
    harness.present();
    expect(harness.events).toHaveLength(3);
  });

  it("creates a stable new message only after the previous stream finishes", () => {
    const harness = makeHarness();
    harness.controller.push("message-1", 0, "one");
    harness.present();
    harness.controller.finish();
    harness.controller.push("message-2", 0, "two");
    harness.present();

    expect(harness.events.map(([type, value]) => type === "start" ? value : type)).toEqual([
      "message-1", "append", "finish", "message-2", "append",
    ]);
  });
});

describe("transcript reducer", () => {
  it("updates one assistant identity without disturbing surrounding items", () => {
    const actions: readonly TranscriptAction[] = [
      { type: "append_user", id: "user-1", text: "Question", steered: false },
      { type: "start_assistant", id: "assistant-1" },
      { type: "append_assistant", id: "assistant-1", segments: [[0, "Answer"], [1, " continued"]] },
      { type: "finish_assistant", id: "assistant-1", segments: [[0, "Final"], [1, " answer"]] },
      { type: "start_assistant", id: "assistant-1" },
      { type: "finish_assistant", id: "assistant-1" },
    ];
    const items = actions.reduce(transcriptReducer, []);
    const assistant = items.find((item) => item.kind === "assistant");

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "user", text: "Question", steered: false });
    expect(assistant?.kind).toBe("assistant");
    if (assistant?.kind === "assistant") {
      expect(assistantText(assistant)).toBe("Final answer");
      expect(assistant.active).toBe(false);
    }
  });

  it("merges IPython start, update, and end events into one execution record", () => {
    const start: TranscriptAction = { type: "tool", id: "execution-1", event: {
      kind: "tool", sequence: 1, phase: "start", callId: "call-1", name: "ipython", isError: false, detail: "",
      ipython: { executionTarget: "local", status: "running", code: "print(1)", detail: "", startedAt: 1_000, durationMs: null },
    } };
    const update: TranscriptAction = { type: "tool", id: "ignored-update", event: {
      kind: "tool", sequence: 2, phase: "update", callId: "call-1", name: "ipython", isError: false, detail: "",
      ipython: { executionTarget: "local", status: "running", code: "print(1)", detail: "starting", startedAt: 1_000, durationMs: null },
    } };
    const end: TranscriptAction = { type: "tool", id: "ignored-end", event: {
      kind: "tool", sequence: 3, phase: "end", callId: "call-1", name: "ipython", isError: false, detail: "",
      ipython: { executionTarget: "local", status: "succeeded", code: "print(1)", detail: "1", startedAt: 1_000, durationMs: 25.5 },
    } };

    const items = [start, update, end].reduce(transcriptReducer, []);

    expect(items).toEqual([{
      id: "execution-1", kind: "ipython_execution", callId: "call-1", executionTarget: "local",
      status: "succeeded", code: "print(1)", detail: "1", startedAt: 1_000, durationMs: 25.5,
    }]);
  });

  it("keeps generic tools generic instead of guessing that they are IPython executions", () => {
    const action: TranscriptAction = { type: "tool", id: "tool-1", event: {
      kind: "tool", sequence: 1, phase: "end", callId: "call-1", name: "python", isError: false, detail: "done",
    } };

    expect(transcriptReducer([], action)).toEqual([{
      id: "tool-1", kind: "tool", callId: "call-1", name: "python", detail: "done", phase: "end", isError: false,
    }]);
  });

  it("updates one delegation block in place as a subagent progresses", () => {
    const running: TranscriptAction = { type: "delegation", id: "block-1", event: { kind: "delegation", sequence: 1, childId: "sub-1", activeSessionId: "active-1", name: "reviewer", task: "Review the API", status: "running", detail: "" } };
    const done: TranscriptAction = { type: "delegation", id: "ignored", event: { kind: "delegation", sequence: 2, childId: "sub-1", activeSessionId: "active-1", name: "reviewer", task: "Review the API", status: "done", detail: "No findings" } };
    const items = [running, done].reduce(transcriptReducer, []);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "delegation", id: "block-1", status: "done", detail: "No findings" });
  });

  it("clears speculative text when the authoritative message has no text blocks", () => {
    const actions: readonly TranscriptAction[] = [
      { type: "start_assistant", id: "assistant-1" },
      { type: "append_assistant", id: "assistant-1", segments: [[0, "speculative"]] },
      { type: "finish_assistant", id: "assistant-1", segments: [] },
    ];
    const items = actions.reduce(transcriptReducer, []);
    const assistant = items[0];
    expect(assistant?.kind === "assistant" ? assistantText(assistant) : null).toBe("");
  });
});

it("preserves legacy remote IPython executions as truthful execution cards", () => {
  const items = transcriptReducer([], { type: "tool", id: "remote-1", event: {
    kind: "tool", sequence: 1, phase: "end", callId: "remote-call", name: "ipython", isError: false, detail: "done",
    ipython: { executionTarget: "modal", status: "succeeded", code: "print(1)", detail: "1", startedAt: 1_000, durationMs: 4 },
  } });
  expect(items[0]).toMatchObject({ kind: "ipython_execution", executionTarget: "modal" });
});

describe("IPython execution card", () => {
  it("exposes accessible structure while preserving the captured runtime", () => {
    const markup = renderToStaticMarkup(createElement(IPythonExecutionCard, { execution: {
      id: "execution-1", kind: "ipython_execution", callId: "call-1", executionTarget: "modal",
      status: "succeeded", code: "print(1)", detail: "1", startedAt: 1_000, durationMs: 25,
    } }));

    expect(markup).toContain("<section");
    expect(markup).toContain("aria-labelledby=");
    expect(markup).toContain("<details");
    expect(markup).toContain('aria-label="Executed IPython input"');
    expect(markup).toContain('aria-label="IPython output"');
    expect(markup).toContain("Remote (legacy)");
    expect(markup).not.toContain(">Local<");
  });

  it("omits fabricated timing when historical start time is unavailable", () => {
    const markup = renderToStaticMarkup(createElement(IPythonExecutionCard, { execution: {
      id: "execution-2", kind: "ipython_execution", callId: "call-2", executionTarget: "unknown",
      status: "succeeded", code: "print(2)", detail: "2", startedAt: null, durationMs: null,
    } }));
    expect(markup).not.toContain("Runtime unavailable");
    expect(markup).not.toContain("aria-describedby");
    expect(markup).not.toContain("Started");
    expect(markup).not.toContain("1970");
  });
});

describe("safe agent errors", () => {
  it("keeps backend diagnostics out of actionable renderer copy", () => {
    expect(safeAgentErrorMessage("workspace_catalog")).toBe("Unable to refresh the workspace. Check the workspace connection; Ernie will retry automatically.");
    expect(safeAgentErrorMessage("protocol")).toBe("Unable to process the response. Restart Prime Agent and try again.");
    expect(safeAgentErrorMessage("assistant")).toBe("The response stopped unexpectedly. Send your message again.");
    expect(safeAgentErrorMessage("extension")).toBe("An extension failed. Try the action again.");
    expect(safeAgentErrorMessage("rpc: secret /Users/example")).toBe("Prime Agent could not complete the action. Try again.");
  });
});
