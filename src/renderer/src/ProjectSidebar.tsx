import type { AgentState } from "../../shared/contract";
import type { WorkspaceAgent, WorkspaceWorktree } from "../../shared/workspace";

function PlusIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>;
}

function BranchIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="6" cy="5" r="2" /><circle cx="14" cy="15" r="2" /><path d="M6 7v4a4 4 0 0 0 4 4h2M14 13V5" /></svg>;
}

function StatusDot({ status }: { readonly status: WorkspaceAgent["status"] }) {
  return <span className={`session-dot ${status}`} aria-hidden="true" />;
}

function WorktreeGroup({ worktree, agents }: { readonly worktree: WorkspaceWorktree; readonly agents: readonly WorkspaceAgent[] }) {
  const headingId = `worktree-${encodeURIComponent(worktree.id)}`;
  return <section className="worktree-group" aria-labelledby={headingId}>
    <header><span className="branch-mark"><BranchIcon /></span><strong id={headingId}>{worktree.label}</strong><small>{agents.length}</small></header>
    <div className="session-list">
      {agents.map((agent) => <button key={agent.id} type="button" className={`session-row ${agent.runtimeKind}`} title={agent.summary || agent.name}>
        <StatusDot status={agent.status} />
        <span><strong>{agent.name}</strong>{agent.status === "working" && <small>{agent.summary || "Working"}</small>}</span>
      </button>)}
      {agents.length === 0 && <p>No sessions yet</p>}
    </div>
  </section>;
}

/** Project-grouped navigation adapted from T3 Code's Sidebar V2 interaction model. */
export function ProjectSidebar({ projectName, worktrees, agents, state, busy, onNewThread }: {
  readonly projectName: string;
  readonly worktrees: readonly WorkspaceWorktree[];
  readonly agents: readonly WorkspaceAgent[];
  readonly state: AgentState | null;
  readonly busy: boolean;
  readonly onNewThread: () => void;
}) {
  return <aside className="project-sidebar" aria-label={`${projectName} project`}>
    <div className="project-heading"><span>{projectName.slice(0, 1).toUpperCase()}</span><div><strong>{projectName}</strong><small>Local project</small></div></div>
    <button type="button" className="new-thread" onClick={onNewThread} disabled={busy || state?.connection !== "ready"}><PlusIcon /><span>New thread</span><kbd>⌘N</kbd></button>
    <div className="sidebar-section-heading"><span>Worktrees</span><small>{worktrees.length}</small></div>
    <div className="project-tree">{worktrees.map((worktree) => <WorktreeGroup key={worktree.id} worktree={worktree} agents={agents.filter((agent) => agent.worktreeId === worktree.id)} />)}</div>
  </aside>;
}
