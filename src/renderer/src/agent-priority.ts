import type { WorkspaceAgent } from "../../shared/workspace";

const ATTENTION_RANK: Partial<Record<WorkspaceAgent["status"], number>> = {
  failed: 0,
  waiting: 1,
  working: 2,
  idle: 3,
};

/**
 * Projects the global agent inventory into Ernie's automatic attention queue.
 * Terminal states are excluded; equal-status agents are ordered by latest activity.
 */
export function prioritizeAgents(agents: readonly WorkspaceAgent[]): readonly WorkspaceAgent[] {
  return agents
    .filter((agent) => ATTENTION_RANK[agent.status] !== undefined)
    .toSorted((left, right) => {
      const rank = (ATTENTION_RANK[left.status] ?? 99) - (ATTENTION_RANK[right.status] ?? 99);
      if (rank !== 0) return rank;
      return (right.lastActivityAt ?? "").localeCompare(left.lastActivityAt ?? "");
    });
}

/** Projects only root agents into the Priority view; delegated children remain in Grouped. */
export function prioritizeRootAgents(agents: readonly WorkspaceAgent[]): readonly WorkspaceAgent[] {
  return prioritizeAgents(agents.filter((agent) => agent.runtimeKind === "root"));
}
