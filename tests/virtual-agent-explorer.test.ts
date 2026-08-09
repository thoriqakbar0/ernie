// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkspaceSnapshot } from "../src/shared/workspace";
import { VirtualAgentExplorer, flattenVirtualAgentExplorer } from "../src/renderer/src/components/workspace/virtual-agent-explorer";
import { flattenAgentHierarchy } from "../src/renderer/src/components/workspace/project-sidebar";

const snapshot: WorkspaceSnapshot = {
  updatedAt: "2026-01-01T00:00:00.000Z",
  projects: [],
  worktrees: [
    { id: "/repo", path: "/repo", label: "main" },
    { id: "/repo/feature", path: "/repo/feature", label: "feature", parentWorktreeId: "/repo" },
  ],
  agents: [
    { id: "root", sessionId: "root-session", worktreeId: "/repo", name: "Ernie", summary: "Coordinate work", status: "waiting", runtimeKind: "root" },
    { id: "child", sessionId: "child-session", worktreeId: "/repo", parentAgentId: "root", name: "Reviewer", summary: "Review changes", status: "working", runtimeKind: "subagent" },
    { id: "feature-root", sessionId: "feature-session", worktreeId: "/repo/feature", name: "Builder", summary: "Build feature", status: "idle", runtimeKind: "root" },
  ],
};

describe("virtual agent explorer", () => {
  it("flattens worktree and subagent ancestry with counts and indentation", () => {
    const rows = flattenVirtualAgentExplorer(snapshot);
    expect(rows.map((row) => [row.kind, row.kind === "worktree" ? row.worktree.id : row.agent.id, row.depth])).toEqual([
      ["worktree", "/repo", 0],
      ["agent", "root", 1],
      ["agent", "child", 2],
      ["worktree", "/repo/feature", 1],
      ["agent", "feature-root", 2],
    ]);
    expect(rows[0]).toMatchObject({ kind: "worktree", agentCount: 2 });
    expect(rows[3]).toMatchObject({ kind: "worktree", agentCount: 1 });
  });

  it("promotes cyclic and missing parent relationships instead of dropping rows", () => {
    const malformed: WorkspaceSnapshot = {
      updatedAt: snapshot.updatedAt,
      projects: [],
      worktrees: [
        { id: "a", path: "/a", label: "a", parentWorktreeId: "b" },
        { id: "b", path: "/b", label: "b", parentWorktreeId: "a" },
      ],
      agents: [
        { id: "orphan", sessionId: "orphan", worktreeId: "a", parentAgentId: "missing", name: "Orphan", summary: "", status: "disconnected", runtimeKind: "subagent" },
      ],
    };
    const rows = flattenVirtualAgentExplorer(malformed);
    expect(rows.filter(({ kind }) => kind === "worktree")).toHaveLength(2);
    expect(rows.some((row) => row.kind === "agent" && row.agent.id === "orphan")).toBe(true);
  });


  it("renders only explicit agent ancestry and promotes malformed parents", () => {
    const agents = [
      ...snapshot.agents.slice(0, 2),
      { id: "orphan", sessionId: "orphan", worktreeId: "/repo", parentAgentId: "missing", name: "Orphan", summary: "", status: "idle" as const, runtimeKind: "subagent" as const },
      { id: "cycle-a", sessionId: "cycle-a", worktreeId: "/repo", parentAgentId: "cycle-b", name: "Cycle A", summary: "", status: "idle" as const, runtimeKind: "subagent" as const },
      { id: "cycle-b", sessionId: "cycle-b", worktreeId: "/repo", parentAgentId: "cycle-a", name: "Cycle B", summary: "", status: "idle" as const, runtimeKind: "subagent" as const },
    ];
    expect(flattenAgentHierarchy(agents).map(({ agent, depth }) => [agent.id, depth])).toEqual([
      ["root", 0],
      ["child", 1],
      ["orphan", 0],
      ["cycle-a", 0],
      ["cycle-b", 1],
    ]);
  });

  it.each([
    ["loading", "Loading worktrees…", "status"],
    ["ready", "No worktrees found in this repository.", "status"],
    ["error", "Unable to load worktrees.", "alert"],
  ] as const)("renders the %s empty state accessibly", (loadState, message, role) => {
    const html = renderToStaticMarkup(createElement(VirtualAgentExplorer, {
      snapshot: { updatedAt: snapshot.updatedAt, projects: [], worktrees: [], agents: [] },
      currentSessionId: "",
      activeAgentId: "",
      onOpenAgent: () => undefined,
      loadState,
    }));
    expect(html).toContain(`role="${role}"`);
    expect(html).toContain(message);
    if (loadState === "loading") expect(html).toContain('aria-busy="true"');
  });
});
