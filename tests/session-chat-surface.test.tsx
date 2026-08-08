// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionTranscriptEvent } from "../src/shared/sessionTranscript";
import type { WorkspaceAgent } from "../src/shared/workspace";
import { DAEMON_ERROR_GRACE_MS, SessionChatSurface } from "../src/renderer/src/SessionChatSurface";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

const agent: WorkspaceAgent = {
  id: "active-agent",
  activeSessionId: "active-agent",
  sessionId: "saved-session",
  worktreeId: "worktree",
  name: "Agent",
  summary: "",
  status: "working",
  runtimeKind: "root",
};

const originalErnie = Object.getOwnPropertyDescriptor(window, "ernie");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalErnie) Object.defineProperty(window, "ernie", originalErnie);
  else Reflect.deleteProperty(window, "ernie");
});

describe("SessionChatSurface daemon grace", () => {
  it("delays terminal UI when a live attachment closes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    let listener: ((event: SessionTranscriptEvent) => void) | undefined;
    Object.defineProperty(window, "ernie", {
      configurable: true,
      value: {
        onSessionTranscriptEvent: (next: (event: SessionTranscriptEvent) => void) => { listener = next; return () => { listener = undefined; }; },
        selectSessionTranscript: async () => ({ kind: "snapshot", activeSessionId: "active-agent", items: [], historyTruncated: false }),
        detachSessionTranscript: async () => {},
      },
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<SessionChatSurface
      agent={agent}
      state={undefined}
      interactive={false}
      spaceId={undefined}
      assistantSubagentCount={0}
      assistantRunningSubagentCount={0}
      onShowAssistantHierarchy={vi.fn()}
    />));
    await act(async () => Promise.resolve());

    await act(async () => listener?.({ kind: "closed", activeSessionId: "active-agent" }));
    expect(container.textContent).toContain("Reconnecting to session");
    expect(container.textContent).not.toContain("This session is no longer live");
    expect(container.textContent).not.toContain("Live updates stopped");

    await act(async () => { vi.advanceTimersByTime(DAEMON_ERROR_GRACE_MS - 1); });
    expect(container.textContent).not.toContain("This session is no longer live");
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(container.textContent).toContain("This session is no longer live");
    expect(container.textContent).not.toContain("Live updates stopped");
    await act(async () => root.unmount());
  });
});
