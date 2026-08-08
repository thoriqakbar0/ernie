import type { WorkspaceAgent, WorkspaceProject, WorkspaceSnapshot } from "../../shared/workspace";

export function projectForAgent(snapshot: WorkspaceSnapshot, agent: WorkspaceAgent): WorkspaceProject | undefined {
  return snapshot.projects.find((project) => project.worktreeIds.includes(agent.worktreeId));
}

export function statusText(status: WorkspaceAgent["status"]): string {
  switch (status) {
    case "working": return "Working";
    case "waiting": return "Waiting for input";
    case "idle": return "Idle";
    case "completed": return "Completed";
    case "failed": return "Failed";
    case "cancelled": return "Cancelled";
    case "disconnected": return "Disconnected";
  }
}

/** Counts transitive subagents connected to a root without trusting input ordering. */
export function countAgentDescendants(agents: readonly WorkspaceAgent[], rootAgentId: string): number {
  const descendants = new Set([rootAgentId]);
  for (let pass = 0; pass < agents.length; pass += 1) {
    let changed = false;
    for (const agent of agents) {
      if (agent.parentAgentId !== undefined && descendants.has(agent.parentAgentId) && !descendants.has(agent.id)) {
        descendants.add(agent.id);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return descendants.size - 1;
}
