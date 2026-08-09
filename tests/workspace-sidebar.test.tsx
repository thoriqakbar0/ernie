// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSidebar } from "../src/renderer/src/components/workspace-sidebar";
import type { WorkspaceSnapshot } from "../src/shared/workspace";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

const snapshot = {
  projects: [
    { id: "/repo", path: "/repo", label: "Ernie", worktreeIds: ["/repo", "/repo-auth"] },
    { id: "/garden", path: "/garden", label: "Garden", worktreeIds: ["/garden"] },
  ],
  worktrees: [
    { id: "/repo", path: "/repo", label: "main" },
    { id: "/repo-auth", path: "/trees/auth", label: "auth-audit" },
    { id: "/garden", path: "/garden", label: "main" },
  ],
  agents: [
    { id: "root", sessionId: "root-session", worktreeId: "/repo", name: "Auth audit", summary: "Reviewing auth", status: "working", runtimeKind: "root" },
    { id: "child", sessionId: "child-session", worktreeId: "/repo", parentAgentId: "root", name: "test-reviewer", summary: "Review tests", status: "working", runtimeKind: "subagent" },
    { id: "garden", sessionId: "garden-session", worktreeId: "/garden", name: "Plant notes", summary: "Done", status: "completed", runtimeKind: "root" },
  ],
  updatedAt: "2026-08-10T00:00:00.000Z",
} satisfies WorkspaceSnapshot;

function sidebarProps() {
  return {
    snapshot,
    activeProjectId: "/repo",
    activeWorktreeId: "/repo",
    activeAgentId: "root",
    loading: false,
    failed: false,
    opening: false,
    archivingProjectId: undefined,
    openError: undefined,
    worktreeBusyOwner: undefined,
    worktreeError: undefined,
    compact: false,
    open: true,
    revealAgent: undefined,
    performanceEnabled: false,
    onTogglePerformance: vi.fn(),
    onClose: vi.fn(),
    onSelectProject: vi.fn(),
    onSelectWorktree: vi.fn(),
    onArchiveProject: vi.fn(),
    onCreateWorktree: vi.fn(),
    onArchiveWorktree: vi.fn(),
    onRestoreWorktree: vi.fn(),
    onRemoveWorktree: vi.fn(),
    onOpenAgent: vi.fn(),
    onOpenDirectory: vi.fn(),
  };
}

describe("WorkspaceSidebar tab shell navigation", () => {
  it("uses the far-left rail for repositories and the selected repository sidebar for Spaces", async () => {
    const props = sidebarProps();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<WorkspaceSidebar {...props} />));

    expect(container.querySelectorAll(".project-rail-button:not(.add)")).toHaveLength(2);
    expect(container.querySelector('[aria-label="Ernie Spaces"]')).not.toBeNull();
    expect(container.querySelector("#agents-panel")).toBeNull();
    expect([...container.querySelectorAll(".focused-session-row strong")].map((node) => node.textContent)).toEqual(["Auth audit", "New Space"]);
    expect(container.textContent).not.toContain("test-reviewer");
    expect(container.textContent).not.toContain("Plant notes");

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open Garden repository"]')?.click());
    expect(props.onSelectProject).toHaveBeenCalledWith("/garden");
    await act(async () => container.querySelector<HTMLButtonElement>('#workspace-agent-root')?.click());
    expect(props.onOpenAgent).toHaveBeenCalledWith(snapshot.agents[0]);

    await act(async () => root.unmount());
  });

  it("keeps a Space in the repository index when it has no open tab or saved session", async () => {
    const props = sidebarProps();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<WorkspaceSidebar {...props} activeAgentId={undefined} />));

    const emptySpace = [...container.querySelectorAll<HTMLElement>(".focused-worktree")].find((group) => group.textContent?.includes("auth-audit"));
    expect(emptySpace?.textContent).toContain("New Space");
    expect(emptySpace?.querySelector(".focused-session-row")?.getAttribute("aria-current")).toBeNull();

    await act(async () => root.unmount());
  });
});
