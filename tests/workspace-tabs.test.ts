import { describe, expect, it } from "vitest";
import type { WorkspaceAgent, WorkspaceSnapshot, WorkspaceWorktree } from "../src/shared/workspace";
import { initialWorkspaceTabs, resolveRootTabStatus, resolveWorkspaceTabSurface, workspaceTabsReducer } from "../src/renderer/src/workspace-tabs";

const rootWorktree: WorkspaceWorktree = { id: "/repo", path: "/repo", label: "main" };
const childWorktree: WorkspaceWorktree = { id: "/repo/child", path: "/repo/child", label: "feature", parentWorktreeId: "/repo" };
const rootAgent: WorkspaceAgent = {
  id: "active-root", activeSessionId: "active-root", sessionId: "root-session", worktreeId: "/repo",
  name: "ernie", summary: "Root", status: "idle", runtimeKind: "root",
};
const rootChild: WorkspaceAgent = {
  id: "root-child", activeSessionId: "root-child", sessionId: "root-child-session", worktreeId: "/repo",
  parentAgentId: "active-root", childId: "sub-root", name: "local reviewer", summary: "Review root", status: "waiting", runtimeKind: "subagent",
};
const child: WorkspaceAgent = {
  id: "active-child", activeSessionId: "active-child", sessionId: "child-session", worktreeId: "/repo/child",
  parentAgentId: "active-root", childId: "sub-1", name: "reviewer", summary: "Review the API", status: "working", runtimeKind: "subagent",
};
const sibling: WorkspaceAgent = { ...child, id: "sibling", sessionId: "sibling-session", name: "tester", status: "idle" };

function snapshot(worktrees: readonly WorkspaceWorktree[], agents: readonly WorkspaceAgent[]): WorkspaceSnapshot {
  return { projects: [], worktrees, agents, updatedAt: "2026-01-01T00:00:00.000Z" };
}

function initial() {
  return initialWorkspaceTabs({ agentId: rootAgent.id, worktreeId: rootWorktree.id, title: rootWorktree.label });
}

describe("worktree-first workspace tab navigation", () => {
  it("opens a Git worktree even when it has no session", () => {
    const opened = workspaceTabsReducer(initial(), { type: "open_worktree", worktree: childWorktree });
    expect(opened.tabs[1]).toMatchObject({ worktreeId: childWorktree.id, selectedAgentId: "", title: "feature", attachment: "attached" });
    expect(resolveWorkspaceTabSurface(opened, snapshot([rootWorktree, childWorktree], [rootAgent]))).toMatchObject({
      kind: "empty", worktree: { id: childWorktree.id },
    });
  });

  it("uses one tab per worktree and changes that tab's selected agent", () => {
    const opened = workspaceTabsReducer(initial(), { type: "open_agent", agent: child, worktree: childWorktree });
    const switched = workspaceTabsReducer(opened, { type: "open_agent", agent: sibling, worktree: childWorktree });

    expect(switched.tabs).toHaveLength(2);
    expect(switched.activeTabId).toBe("worktree:/repo/child");
    expect(switched.tabs[1]).toMatchObject({
      id: "worktree:/repo/child", worktreeId: "/repo/child", selectedAgentId: "sibling", title: "feature", pinned: false,
    });
  });

  it("selects an agent in the pinned root worktree without creating an agent tab", () => {
    const selected = workspaceTabsReducer(initial(), { type: "open_agent", agent: rootChild, worktree: rootWorktree });
    expect(selected.tabs).toHaveLength(1);
    expect(selected.tabs[0]).toMatchObject({ id: "root", worktreeId: "/repo", selectedAgentId: "root-child", pinned: true });
    expect(resolveWorkspaceTabSurface(selected, snapshot([rootWorktree], [rootAgent, rootChild]))).toMatchObject({
      kind: "agent", agent: { id: "root-child" },
    });
  });

  it("makes only the root agent selected in the pinned root worktree commandable", () => {
    const state = workspaceTabsReducer(initial(), {
      type: "sync_workspace", worktrees: [rootWorktree], agents: [rootAgent, rootChild],
    });
    expect(resolveWorkspaceTabSurface(state, snapshot([rootWorktree], [rootAgent, rootChild]))).toMatchObject({ kind: "root" });

    const childSelected = workspaceTabsReducer(state, { type: "open_agent", agent: rootChild });
    expect(resolveWorkspaceTabSurface(childSelected, snapshot([rootWorktree], [rootAgent, rootChild]))).toMatchObject({ kind: "agent" });

    const rootSelected = workspaceTabsReducer(childSelected, { type: "open_agent", agent: rootAgent });
    expect(resolveWorkspaceTabSurface(rootSelected, snapshot([rootWorktree], [rootAgent, rootChild]))).toMatchObject({ kind: "root" });
  });

  it("closes only the local worktree view and never the pinned root view", () => {
    const opened = workspaceTabsReducer(initial(), { type: "open_agent", agent: child, worktree: childWorktree });
    const closed = workspaceTabsReducer(opened, { type: "close", tabId: "worktree:/repo/child" });
    const pinned = workspaceTabsReducer(closed, { type: "close", tabId: "root" });
    expect(pinned.tabs.map((tab) => tab.id)).toEqual(["root"]);
    expect(pinned.activeTabId).toBe("root");
    expect(child.status).toBe("working");
  });

  it("syncs worktree labels and selected-agent status from authoritative catalog data", () => {
    const opened = workspaceTabsReducer(initial(), { type: "open_agent", agent: child });
    const syncedAgent = { ...child, status: "completed" as const };
    const synced = workspaceTabsReducer(opened, {
      type: "sync_workspace", worktrees: [rootWorktree, { ...childWorktree, label: "renamed-feature" }], agents: [rootAgent, syncedAgent],
    });
    expect(synced.tabs[1]).toMatchObject({ title: "renamed-feature", status: "completed", attachment: "attached" });
    expect(resolveWorkspaceTabSurface(synced, snapshot([rootWorktree, childWorktree], [rootAgent, syncedAgent]))).toMatchObject({
      kind: "agent", agent: { id: child.id, status: "completed" },
    });
  });

  it("retains a missing worktree view but detaches it fail-closed", () => {
    const opened = workspaceTabsReducer(initial(), { type: "open_agent", agent: child, worktree: childWorktree });
    const synced = workspaceTabsReducer(opened, { type: "sync_workspace", worktrees: [rootWorktree], agents: [rootAgent, child] });
    expect(synced.tabs[1]).toMatchObject({ worktreeId: childWorktree.id, attachment: "detached", status: "disconnected" });
    expect(resolveWorkspaceTabSurface(synced, snapshot([rootWorktree], [rootAgent, child]))).toMatchObject({
      kind: "detached", reason: "missing_worktree",
    });
  });

  it("does not resolve a missing or cross-worktree selected agent as root", () => {
    const opened = workspaceTabsReducer(initial(), { type: "open_agent", agent: child, worktree: childWorktree });
    const missing = resolveWorkspaceTabSurface(opened, snapshot([rootWorktree, childWorktree], [rootAgent]));
    expect(missing).toMatchObject({ kind: "detached", reason: "missing_agent" });

    const moved = { ...child, worktreeId: rootWorktree.id };
    expect(resolveWorkspaceTabSurface(opened, snapshot([rootWorktree, childWorktree], [rootAgent, moved]))).toMatchObject({
      kind: "detached", reason: "agent_worktree_mismatch",
    });
  });

  it("uses deterministic neighboring selection when an active view closes", () => {
    const otherWorktree: WorkspaceWorktree = { id: "/repo/other", path: "/repo/other", label: "other" };
    const other = { ...child, id: "other-agent", sessionId: "other-session", worktreeId: otherWorktree.id };
    const withChild = workspaceTabsReducer(initial(), { type: "open_agent", agent: child, worktree: childWorktree });
    const withOther = workspaceTabsReducer(withChild, { type: "open_agent", agent: other, worktree: otherWorktree });
    const closed = workspaceTabsReducer(withOther, { type: "close", tabId: "worktree:/repo/other" });
    expect(closed.activeTabId).toBe("worktree:/repo/child");
  });

  it("preserves catalog root status unless live RPC signals are stronger", () => {
    expect(resolveRootTabStatus(true, false, "waiting")).toBe("waiting");
    expect(resolveRootTabStatus(true, false, "failed")).toBe("failed");
    expect(resolveRootTabStatus(true, true, "waiting")).toBe("working");
    expect(resolveRootTabStatus(false, false, "idle")).toBe("disconnected");
  });
});
