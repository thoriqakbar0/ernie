import type { WorkspaceAgent, WorkspaceProject, WorkspaceSnapshot } from "../../../shared/workspace";

const MAX_AGENT_DISPLAY_NAME_LENGTH = 36;

/** Produces a stable sidebar label while retaining the full session name in accessible metadata. */
export function agentDisplayName(name: string): string {
  const normalized = name.trim().replace(/\s+/gu, " ");
  if (normalized === "") return "Untitled agent";
  const withoutUrl = normalized.replace(/\s*(?:[:—-]\s*)?https?:\/\/\S.*$/u, "").replace(/[,:;—-]+$/u, "").trim();
  const candidate = withoutUrl || normalized;
  if (candidate.length <= MAX_AGENT_DISPLAY_NAME_LENGTH) return candidate;
  const prefix = candidate.slice(0, MAX_AGENT_DISPLAY_NAME_LENGTH - 1);
  const wordBoundary = prefix.lastIndexOf(" ");
  const visible = wordBoundary >= 20 ? prefix.slice(0, wordBoundary) : prefix;
  return `${visible.trimEnd()}…`;
}

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

function descendantAgentIds(agents: readonly WorkspaceAgent[], rootAgentId: string): ReadonlySet<string> {
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
  descendants.delete(rootAgentId);
  return descendants;
}

/** Counts transitive subagents connected to a root without trusting input ordering. */
export function countAgentDescendants(agents: readonly WorkspaceAgent[], rootAgentId: string): number {
  return descendantAgentIds(agents, rootAgentId).size;
}

/** The visible and animated descendant counts for one root Agent. */
export interface AgentDescendantActivity {
  readonly engaged: number;
  readonly working: number;
}

/** Summarizes descendant activity in one hierarchy traversal. */
export function summarizeAgentDescendantActivity(agents: readonly WorkspaceAgent[], rootAgentId: string): AgentDescendantActivity {
  const descendants = descendantAgentIds(agents, rootAgentId);
  let engaged = 0;
  let working = 0;
  for (const agent of agents) {
    if (!descendants.has(agent.id)) continue;
    if (agent.status === "working") { engaged += 1; working += 1; }
    else if (agent.status === "waiting") engaged += 1;
  }
  return { engaged, working };
}

/** Counts descendants that are working or waiting, excluding idle and terminal sessions. */
export function countEngagedAgentDescendants(agents: readonly WorkspaceAgent[], rootAgentId: string): number {
  return summarizeAgentDescendantActivity(agents, rootAgentId).engaged;
}

/** Counts working descendants so active delegation can receive motion without styling waiting sessions. */
export function countWorkingAgentDescendants(agents: readonly WorkspaceAgent[], rootAgentId: string): number {
  return summarizeAgentDescendantActivity(agents, rootAgentId).working;
}
