// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSidebar } from "../src/renderer/src/WorkspaceSidebar";
import type { WorkspaceSnapshot } from "../src/shared/workspace";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

const snapshot = {
  projects: [
    { id: "/repo", path: "/repo", label: "repo", worktreeIds: ["/repo"] },
    { id: "/other", path: "/other", label: "other", worktreeIds: ["/other"] },
  ],
  worktrees: [
    { id: "/repo", path: "/repo", label: "main" },
    { id: "/other", path: "/other", label: "main" },
  ],
  agents: [
    { id: "root", sessionId: "root-session", worktreeId: "/repo", name: "Root", summary: "", status: "idle", runtimeKind: "root" },
    { id: "child", sessionId: "child-session", worktreeId: "/repo", parentAgentId: "root", name: "Child", summary: "", status: "idle", runtimeKind: "subagent" },
    { id: "other", sessionId: "other-session", worktreeId: "/other", name: "Other", summary: "", status: "idle", runtimeKind: "root" },
  ],
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
    const rows = container.querySelectorAll<HTMLElement>(".workspace-agent-list .focused-session-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.style.animationDelay).toBe("calc(2 * var(--agent-row-stagger))");
    expect(rows[1]?.style.animationDelay).toBe("calc(1 * var(--agent-row-stagger))");
    expect(rows[2]?.style.animationDelay).toBe("calc(0 * var(--agent-row-stagger))");
    expect(container.querySelector(".workspace-agent-pane")?.getAttribute("data-motion")).toBe("vertical");

    const priority = container.querySelector<HTMLButtonElement>("#priority-tab");
    await act(async () => priority?.click());
    expect(container.querySelector(".workspace-agent-pane")?.getAttribute("data-motion")).toBe("horizontal");
    expect(container.querySelector(".workspace-agent-pane")?.getAttribute("data-direction")).toBe("forward");

    await act(async () => disclosure?.click());
    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("#agent-list-panel")).toBeNull();
    await act(async () => disclosure?.click());
    expect(container.querySelector(".workspace-agent-pane")?.getAttribute("data-motion")).toBe("vertical");
    await act(async () => disclosure?.click());
    expect(container.querySelector(".workspace-sidebar-body")?.getAttribute("data-agents-expanded")).toBe("false");
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });
});
