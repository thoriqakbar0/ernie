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
