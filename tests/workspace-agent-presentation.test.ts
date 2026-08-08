import { describe, expect, it } from "vitest";
import type { WorkspaceAgent } from "../src/shared/workspace";
import { countAgentDescendants } from "../src/renderer/src/workspaceAgentPresentation";

function agent(id: string, parentAgentId?: string): WorkspaceAgent {
  return {
    id,
    sessionId: id,
    worktreeId: "worktree",
    ...(parentAgentId ? { parentAgentId } : {}),
    name: id,
    summary: "",
    status: "idle",
    runtimeKind: parentAgentId ? "subagent" : "root",
  };
}

describe("countAgentDescendants", () => {
  it("counts direct and nested subagents independent of catalog order", () => {
    expect(countAgentDescendants([
      agent("grandchild", "child"),
      agent("sibling", "root"),
      agent("root"),
      agent("child", "root"),
      agent("other-root"),
    ], "root")).toBe(3);
  });

  it("does not admit disconnected parent cycles", () => {
    expect(countAgentDescendants([agent("root"), agent("a", "b"), agent("b", "a")], "root")).toBe(0);
  });
});
