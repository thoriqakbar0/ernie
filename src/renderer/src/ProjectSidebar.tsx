import type { WorkspaceAgent, WorkspaceWorktree } from "../../shared/workspace";

function CloseSidebarIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12m6 3-3 3 3 3" /></svg>;
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
    {agents.length > 0 && <ul className="session-list">
      {agents.map((agent) => <li key={agent.id} className={agent.runtimeKind} title={agent.summary || agent.name}>
        <StatusDot status={agent.status} />
        <span><strong>{agent.name}</strong>{agent.status === "working" && agent.summary && <small>{agent.summary}</small>}</span>
      </li>)}
    </ul>}
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
      <span className="project-avatar" aria-hidden="true">{projectName.slice(0, 1).toUpperCase()}</span>
      <div><strong>{projectName}</strong><small>Local project</small></div>
      <button type="button" className="sidebar-close-button" aria-label="Close sidebar" aria-controls="project-sidebar" aria-expanded={open} onClick={onClose}><CloseSidebarIcon /></button>
    </header>
    <div className="sidebar-section-heading"><span>Worktrees</span><small>{worktrees.length}</small></div>
    <div className="project-tree">
      {failed && <p className="sidebar-message">Unable to load this project.</p>}
      {!failed && worktrees.length === 0 && <p className="sidebar-message">No worktrees found.</p>}
      {worktrees.map((worktree) => <WorktreeGroup key={worktree.id} worktree={worktree} agents={agents.filter((agent) => agent.worktreeId === worktree.id)} />)}
    </div>
  </aside>;
}
