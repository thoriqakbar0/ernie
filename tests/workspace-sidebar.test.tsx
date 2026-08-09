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
      activeWorktreeId={undefined}
      activeAgentId={undefined}
      loading={false}
      failed={false}
      opening={false}
      archivingProjectId={undefined}
      openError={undefined}
      compact={false}
      open
      revealAgent={{ agentId: "missing-agent", requestId: 1 }}
      performanceEnabled={false}
      onTogglePerformance={vi.fn()}
      onClose={vi.fn()}
      onSelectProject={vi.fn()}
      onSelectWorktree={vi.fn()}
      onArchiveProject={vi.fn()}
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
    const grouped = container.querySelector<HTMLButtonElement>("#all-agents-tab");
    await act(async () => grouped?.click());
    expect(container.querySelector(".workspace-agent-pane")?.getAttribute("data-direction")).toBe("backward");

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


const linkedSnapshot = {
  projects: [
    { id: "/repo", path: "/repo", label: "repo", worktreeIds: ["/repo-feature", "/repo", "/repo-fix"] },
    { id: "/fallback", path: "/fallback", label: "fallback", worktreeIds: ["/fallback-main"] },
  ],
  worktrees: [
    { id: "/repo-feature", path: "/trees/feature", label: "feature" },
    { id: "/repo", path: "/repo", label: "main" },
    { id: "/repo-fix", path: "/trees/fix", label: "fix" },
    { id: "/fallback-main", path: "/fallback", label: "trunk" },
  ],
  agents: [
    { id: "feature-agent", sessionId: "feature-session", worktreeId: "/repo-feature", name: "Feature", summary: "", status: "working", runtimeKind: "root" },
  ],
  updatedAt: "2026-08-08T00:00:00.000Z",
} satisfies WorkspaceSnapshot;

function sidebarProps(snapshotValue: WorkspaceSnapshot) {
  return {
    snapshot: snapshotValue,
    activeProjectId: undefined,
    activeWorktreeId: undefined,
    activeAgentId: undefined,
    loading: false,
    failed: false,
    opening: false,
    archivingProjectId: undefined,
    openError: undefined,
    compact: false,
    open: true,
    revealAgent: undefined,
    performanceEnabled: false,
    onTogglePerformance: vi.fn(),
    onClose: vi.fn(),
    onSelectProject: vi.fn(),
    onSelectWorktree: vi.fn(),
    onArchiveProject: vi.fn(),
    onOpenAgent: vi.fn(),
    onOpenDirectory: vi.fn(),
  } as const;
}

describe("WorkspaceSidebar Spaces", () => {
  it("renders a checkout-only project as one selectable Space without a disclosure or duplicate row", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const props = sidebarProps(snapshot);
    await act(async () => root.render(<WorkspaceSidebar {...props} />));

    expect(container.querySelectorAll(".workspace-project-row")).toHaveLength(2);
    expect(container.querySelectorAll(".workspace-project-disclosure")).toHaveLength(0);
    expect(container.querySelectorAll(".workspace-worktree-button")).toHaveLength(0);
    const repo = container.querySelector<HTMLButtonElement>(".workspace-project-row");
    expect(repo?.getAttribute("aria-label")).toBe("repo, main");
    expect(repo?.title).toBe("/repo");
    await act(async () => repo?.click());
    expect(props.onSelectProject).toHaveBeenCalledWith("/repo");
    expect(props.onSelectWorktree).not.toHaveBeenCalled();
    const archive = container.querySelector<HTMLButtonElement>(".workspace-project-archive");
    expect(archive?.getAttribute("aria-label")).toBe("Archive other");
    await act(async () => archive?.click());
    expect(props.onArchiveProject).toHaveBeenCalledWith(snapshot.projects[1]);

    await act(async () => root.unmount());
  });

  it("uses the project-id checkout as the root and gives linked worktrees selectable connector rows", async () => {
    const container = document.createElement("div");
    container.dir = "rtl";
    const root = createRoot(container);
    const props = sidebarProps(linkedSnapshot);
    await act(async () => root.render(<WorkspaceSidebar {...props} activeProjectId="/repo" activeWorktreeId="/repo-feature" />));

    const projectRows = container.querySelectorAll<HTMLButtonElement>(".workspace-project-row");
    expect(projectRows[0]?.getAttribute("aria-label")).toBe("repo, main");
    expect(projectRows[0]?.title).toBe("/repo");
    expect(projectRows[1]?.getAttribute("aria-label")).toBe("fallback, trunk");
    expect(container.querySelectorAll(".workspace-project-disclosure")).toHaveLength(1);
    const worktreeRows = container.querySelectorAll<HTMLButtonElement>(".workspace-worktree-button");
    expect(worktreeRows).toHaveLength(2);
    expect(worktreeRows[0]?.getAttribute("aria-label")).toBe("feature, working");
    expect(worktreeRows[0]?.getAttribute("aria-current")).toBe("page");
    expect(worktreeRows[0]?.title).toBe("/trees/feature");
    expect(container.querySelector(".workspace-project-mark")?.classList.contains("working")).toBe(false);
    expect(worktreeRows[0]?.querySelector(".workspace-worktree-mark")?.classList.contains("working")).toBe(true);
    await act(async () => worktreeRows[1]?.click());
    expect(props.onSelectWorktree).toHaveBeenCalledWith("/repo", "/repo-fix");

    await act(async () => root.unmount());
  });

  it("remembers a collapsed project while keeping only its active linked worktree visible", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const props = sidebarProps(linkedSnapshot);
    await act(async () => root.render(<WorkspaceSidebar {...props} activeProjectId="/repo" activeWorktreeId="/repo-feature" />));
    const disclosure = container.querySelector<HTMLButtonElement>(".workspace-project-disclosure");
    await act(async () => disclosure?.click());

    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
    let visibleRows = container.querySelectorAll<HTMLButtonElement>(".workspace-worktree-button");
    expect(visibleRows).toHaveLength(1);
    expect(visibleRows[0]?.textContent).toContain("feature");
    expect(container.querySelector(".workspace-linked-worktree-list")?.getAttribute("data-collapsed")).toBe("true");
    const controlledId = disclosure?.getAttribute("aria-controls");
    const controlledRegion = [...container.querySelectorAll<HTMLElement>("[hidden]")].find((element) => element.id === controlledId);
    expect(controlledRegion?.hidden).toBe(true);
    expect(controlledRegion?.querySelector(".workspace-worktree-button")).toBeNull();
    expect(container.querySelector(".workspace-active-worktree-context")?.contains(visibleRows[0] ?? null)).toBe(true);

    await act(async () => root.render(<WorkspaceSidebar {...props} activeProjectId="/repo" activeWorktreeId="/repo-fix" />));
    visibleRows = container.querySelectorAll<HTMLButtonElement>(".workspace-worktree-button");
    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(visibleRows).toHaveLength(1);
    expect(visibleRows[0]?.textContent).toContain("fix");

    await act(async () => root.render(<WorkspaceSidebar {...props} activeProjectId="/fallback" activeWorktreeId="/fallback-main" />));
    expect(container.querySelectorAll(".workspace-worktree-button")).toHaveLength(0);
    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => root.unmount());
  });
});
