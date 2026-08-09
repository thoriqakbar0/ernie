import { describe, expect, it } from "vitest";
import type { WorkspaceAgent } from "../src/shared/workspace";
import { agentDisplayName, countAgentDescendants, countEngagedAgentDescendants, countWorkingAgentDescendants } from "../src/renderer/src/workspaceAgentPresentation";

function agent(id: string, parentAgentId?: string, status: WorkspaceAgent["status"] = "idle"): WorkspaceAgent {
  return {
    id,
    sessionId: id,
    worktreeId: "worktree",
    ...(parentAgentId ? { parentAgentId } : {}),
    name: id,
    summary: "",
    status,
    runtimeKind: parentAgentId ? "subagent" : "root",
  };
}

describe("agentDisplayName", () => {
  it("removes URL tails, normalizes whitespace, and shortens at word boundaries", () => {
    expect(agentDisplayName("  install   my agentation fork here: https://example.com/package  ")).toBe("install my agentation fork here");
    expect(agentDisplayName("using attune, can you add agentation onboarding to the complete development environment")).toBe("using attune, can you add…");
    expect(agentDisplayName("   ")).toBe("Untitled agent");
  });
});

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

describe("countEngagedAgentDescendants", () => {
  it("counts working and waiting descendants while hiding idle and terminal sessions", () => {
    expect(countEngagedAgentDescendants([
      agent("root"),
      agent("working", "root", "working"),
      agent("waiting", "root", "waiting"),
      agent("idle", "root", "idle"),
      agent("completed", "root", "completed"),
      agent("nested-working", "idle", "working"),
    ], "root")).toBe(3);
  });
});

describe("countWorkingAgentDescendants", () => {
  it("separates working descendants from waiting descendants", () => {
    const agents = [agent("root"), agent("working", "root", "working"), agent("waiting", "root", "waiting")];
    expect(countEngagedAgentDescendants(agents, "root")).toBe(2);
    expect(countWorkingAgentDescendants(agents, "root")).toBe(1);
  });
});
