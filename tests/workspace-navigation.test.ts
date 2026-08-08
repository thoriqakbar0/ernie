import { describe, expect, it } from "vitest";
import type { WorkspaceAgent, WorkspaceProject } from "../src/shared/workspace";
import { agentsForProject } from "../src/renderer/src/FocusedWorkspace";

const project: WorkspaceProject = {
  id: "space-1", path: "/repo", label: "repo", worktreeIds: ["main", "feature"],
};
const root: WorkspaceAgent = {
  id: "root", sessionId: "root", worktreeId: "main", name: "root", summary: "", status: "idle", runtimeKind: "root",
};
const child: WorkspaceAgent = {
  id: "child", sessionId: "child", worktreeId: "feature", parentAgentId: "root", name: "child", summary: "", status: "working", runtimeKind: "subagent",
};
const elsewhere: WorkspaceAgent = {
  id: "elsewhere", sessionId: "elsewhere", worktreeId: "other", name: "elsewhere", summary: "", status: "waiting", runtimeKind: "root",
};

describe("space agent projection", () => {
  it("contains agents from every worktree in catalog order without leaking other spaces", () => {
    expect(agentsForProject(project, [child, elsewhere, root])).toEqual([child, root]);
  });
});
