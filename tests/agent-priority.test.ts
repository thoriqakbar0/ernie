import { describe, expect, it } from "vitest";
import type { AgentStatus, WorkspaceAgent } from "../src/shared/workspace";
import { prioritizeAgents, prioritizeRootAgents } from "../src/renderer/src/agent-priority";

function agent(id: string, status: AgentStatus, lastActivityAt?: string): WorkspaceAgent {
  return {
    id,
    sessionId: `session-${id}`,
    worktreeId: "worktree",
    name: id,
    summary: "",
    status,
    runtimeKind: "root",
    ...(lastActivityAt === undefined ? {} : { lastActivityAt }),
  };
}

describe("prioritizeAgents", () => {
  it("orders attention states and excludes terminal states", () => {
    const result = prioritizeAgents([
      agent("idle", "idle"),
      agent("complete", "completed"),
      agent("working", "working"),
      agent("waiting", "waiting"),
      agent("failed", "failed"),
      agent("cancelled", "cancelled"),
      agent("disconnected", "disconnected"),
    ]);

    expect(result.map(({ id }) => id)).toEqual(["failed", "waiting", "working", "idle"]);
  });

  it("puts the most recently active agent first within one state", () => {
    const result = prioritizeAgents([
      agent("older", "waiting", "2026-01-01T00:00:00.000Z"),
      agent("newer", "waiting", "2026-01-02T00:00:00.000Z"),
    ]);

    expect(result.map(({ id }) => id)).toEqual(["newer", "older"]);
  });

  it("keeps subagents out of the Priority projection", () => {
    const root = agent("root", "waiting");
    const subagent = { ...agent("child", "failed"), runtimeKind: "subagent" as const, parentAgentId: root.id };

    expect(prioritizeRootAgents([subagent, root]).map(({ id }) => id)).toEqual(["root"]);
  });
});
