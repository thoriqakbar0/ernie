// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSidebar } from "../src/renderer/src/WorkspaceSidebar";
import type { WorkspaceSnapshot } from "../src/shared/workspace";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

const snapshot = {
  projects: [],
  worktrees: [],
  agents: [],
  updatedAt: "2026-08-08T00:00:00.000Z",
} satisfies WorkspaceSnapshot;

describe("WorkspaceSidebar Agents disclosure", () => {
  it("starts open, consumes reveal requests once, and gives collapsed space back to Spaces", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<WorkspaceSidebar
      snapshot={snapshot}
      activeProjectId={undefined}
      activeAgentId={undefined}
      loading={false}
      failed={false}
      opening={false}
      openError={undefined}
      compact={false}
      open
      revealAgent={{ agentId: "missing-agent", requestId: 1 }}
      performanceEnabled={false}
      onTogglePerformance={vi.fn()}
      onClose={vi.fn()}
      onSelectProject={vi.fn()}
      onOpenAgent={vi.fn()}
      onOpenDirectory={vi.fn()}
    />));

    const disclosure = container.querySelector<HTMLButtonElement>(".workspace-agents-disclosure");
    expect(disclosure?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("#agent-list-panel")).not.toBeNull();

    await act(async () => disclosure?.click());
    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("#agent-list-panel")).toBeNull();
    expect(container.querySelector(".workspace-sidebar-body")?.getAttribute("data-agents-expanded")).toBe("false");
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });
});
