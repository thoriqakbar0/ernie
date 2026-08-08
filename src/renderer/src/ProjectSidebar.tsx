import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { WorkspaceAgent, WorkspaceWorktree } from "../../shared/workspace";

function CloseSidebarIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2" /><path d="M8 4v12m6-9-3 3 3 3" /></svg>;
}

function BranchIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="6" cy="5" r="1.75" /><circle cx="14" cy="15" r="1.75" /><path d="M6 6.75v4.1A4.15 4.15 0 0 0 10.15 15h2.1M14 13.25V5" /></svg>;
}

function ChevronIcon({ expanded }: { readonly expanded: boolean }) {
  return <svg className="disclosure-chevron" data-expanded={expanded} viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 5 5 5-5 5" /></svg>;
}

type AgentRow = { readonly agent: WorkspaceAgent; readonly depth: number };

/** Preserve only explicit parentAgentId relationships and fail open on missing/cyclic parents. */
export function flattenAgentHierarchy(agents: readonly WorkspaceAgent[]): readonly AgentRow[] {
  const ids = new Set(agents.map(({ id }) => id));
  const parents = new Map<string, string | undefined>();
  for (const agent of agents) {
    const candidate = agent.parentAgentId;
    parents.set(agent.id, candidate !== agent.id && candidate !== undefined && ids.has(candidate) ? candidate : undefined);
  }
  for (const agent of agents) {
    const visited = new Set([agent.id]);
    let cursor = parents.get(agent.id);
    while (cursor !== undefined) {
      if (visited.has(cursor)) { parents.set(agent.id, undefined); break; }
      visited.add(cursor);
      cursor = parents.get(cursor);
    }
  }
  const children = new Map<string | undefined, WorkspaceAgent[]>();
  for (const agent of agents) {
    const parent = parents.get(agent.id);
    children.set(parent, [...(children.get(parent) ?? []), agent]);
  }
  const rows: AgentRow[] = [];
  const append = (parent: string | undefined, depth: number) => {
    for (const agent of children.get(parent) ?? []) {
      rows.push({ agent, depth });
      append(agent.id, depth + 1);
    }
  };
  append(undefined, 0);
  return rows;
}

function SessionRow({ agent, depth }: AgentRow) {
  const visibleStatus = agent.status === "working" || agent.status === "failed" || agent.status === "completed";
  return <li className="session-row" data-kind={agent.runtimeKind} data-depth={depth} aria-level={depth + 1} style={{ "--depth": depth } as CSSProperties} title={`${agent.name} — ${agent.status}`}>
    <span className="session-branch" aria-hidden="true" />
    <span className={`session-status ${agent.status}`} data-visible={visibleStatus} aria-hidden="true" />
    <strong>{agent.name}</strong>
    <span className="sr-only">{agent.status}</span>
  </li>;
}

function WorktreeGroup({ worktree, agents }: { readonly worktree: WorkspaceWorktree; readonly agents: readonly WorkspaceAgent[] }) {
  const [expanded, setExpanded] = useState(true);
  const rows = useMemo(() => flattenAgentHierarchy(agents), [agents]);
  const regionId = `worktree-${encodeURIComponent(worktree.id)}`;
  return <section className="worktree-group">
    <button type="button" className="worktree-disclosure" aria-expanded={expanded} aria-controls={regionId} onClick={() => setExpanded((current) => !current)}>
      <ChevronIcon expanded={expanded} />
      <span className="branch-mark"><BranchIcon /></span>
      <strong>{worktree.label}</strong>
      <small>{agents.length}</small>
    </button>
    <ul id={regionId} className="session-list" hidden={!expanded}>
      {rows.map(({ agent, depth }) => <SessionRow key={agent.id} agent={agent} depth={depth} />)}
    </ul>
  </section>;
}

/** Project-grouped navigation adapted from T3 Code's Sidebar V2 interaction model. */
export function ProjectSidebar({ projectName, worktrees, agents, failed, open, onClose }: {
  readonly projectName: string;
  readonly worktrees: readonly WorkspaceWorktree[];
  readonly agents: readonly WorkspaceAgent[];
  readonly failed: boolean;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  return <aside id="project-sidebar" className="project-sidebar" data-open={open} aria-label={`${projectName} project`} aria-hidden={!open}>
    <header className="project-heading">
      <strong>{projectName}</strong>
      <button type="button" className="sidebar-close-button" aria-label="Close sidebar" aria-controls="project-sidebar" aria-expanded={open} onClick={onClose}><CloseSidebarIcon /></button>
    </header>
    <div className="sidebar-section-heading">Worktrees</div>
    <div className="project-tree">
      {failed && <p className="sidebar-message">Unable to load this project.</p>}
      {!failed && worktrees.length === 0 && <p className="sidebar-message">No worktrees found.</p>}
      {worktrees.map((worktree) => <WorktreeGroup key={worktree.id} worktree={worktree} agents={agents.filter((agent) => agent.worktreeId === worktree.id)} />)}
    </div>
  </aside>;
}
