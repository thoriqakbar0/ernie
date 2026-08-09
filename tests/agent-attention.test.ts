import { describe, expect, it } from "vitest";
import type { AgentStatus, WorkspaceAgent } from "../src/shared/workspace";
import { orderAgentsByAttention, orderRootAgentsByAttention } from "../src/renderer/src/components/workspace-sidebar/agent-attention";

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

describe("orderAgentsByAttention", () => {
  it("orders attention states and excludes terminal states", () => {
    const result = orderAgentsByAttention([
      agent("idle", "idle"),
      agent("complete", "completed"),
      agent("working", "working"),
      agent("waiting", "waiting"),
      agent("failed", "failed"),
      agent("cancelled", "cancelled"),
      agent("disconnected", "disconnected"),
    ]);

    expect(result.map(({ id }) => id)).toEqual(["failed", "waiting"]);
  });

  it("puts the most recently active agent first within one state", () => {
    const result = orderAgentsByAttention([
      agent("older", "waiting", "2026-01-01T00:00:00.000Z"),
      agent("newer", "waiting", "2026-01-02T00:00:00.000Z"),
    ]);

    expect(result.map(({ id }) => id)).toEqual(["newer", "older"]);
  });

  it("keeps subagents out of the Attention projection", () => {
    const root = agent("root", "waiting");
    const subagent = { ...agent("child", "failed"), runtimeKind: "subagent" as const, parentAgentId: root.id };

    expect(orderRootAgentsByAttention([subagent, root]).map(({ id }) => id)).toEqual(["root"]);
  });
});
