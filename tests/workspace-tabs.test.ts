import { describe, expect, it } from "vitest";
import type { WorkspaceAgent } from "../src/shared/workspace";
import { initialWorkspaceTabs, resolveRootTabStatus, resolveWorkspaceTabSurface, workspaceTabsReducer } from "../src/renderer/src/workspaceTabs";

const child: WorkspaceAgent = {
  id: "active-child", activeSessionId: "active-child", sessionId: "child-session", worktreeId: "/repo/child",
  parentAgentId: "active-root", childId: "sub-1", name: "reviewer", summary: "Review the API", status: "working", runtimeKind: "subagent",
};

describe("workspace tab navigation", () => {
  it("opens an agent once and focuses its existing view", () => {
    const root = initialWorkspaceTabs({ agentId: "active-root", worktreeId: "/repo", title: "ernie" });
    const opened = workspaceTabsReducer(root, { type: "open_agent", agent: child });
    const reopened = workspaceTabsReducer(opened, { type: "open_agent", agent: child });
    expect(reopened.tabs).toHaveLength(2);
    expect(reopened.activeTabId).toBe("agent:active-child");
  });

  it("detaches a child view without removing agent data and keeps the pinned root", () => {
    const opened = workspaceTabsReducer(initialWorkspaceTabs({ agentId: "active-root", worktreeId: "/repo", title: "ernie" }), { type: "open_agent", agent: child });
    const closed = workspaceTabsReducer(opened, { type: "close", tabId: "agent:active-child" });
    const pinned = workspaceTabsReducer(closed, { type: "close", tabId: "root" });
    expect(pinned.tabs.map((tab) => tab.id)).toEqual(["root"]);
    expect(pinned.activeTabId).toBe("root");
    expect(child.status).toBe("working");
  });

  it("preserves catalog root status unless live RPC signals are stronger", () => {
    expect(resolveRootTabStatus(true, false, "waiting")).toBe("waiting");
    expect(resolveRootTabStatus(true, false, "failed")).toBe("failed");
    expect(resolveRootTabStatus(true, true, "waiting")).toBe("working");
    expect(resolveRootTabStatus(false, false, "idle")).toBe("disconnected");
  });

  it("marks detached sessions disconnected while preserving their tabs", () => {
    const opened = workspaceTabsReducer(initialWorkspaceTabs({ agentId: "active-root", worktreeId: "/repo", title: "ernie" }), { type: "open_agent", agent: child });
    const synced = workspaceTabsReducer(opened, { type: "sync_agents", agents: [] });
    expect(synced.tabs[1]).toMatchObject({ id: "agent:active-child", status: "disconnected" });
    expect(resolveWorkspaceTabSurface(synced, [])).toMatchObject({ kind: "detached", tab: { id: "agent:active-child" } });
  });
});
