import { useState } from "react";
import type { WorkspaceAgent, WorkspaceProject, WorkspaceSnapshot, WorkspaceWorktree } from "../../../../shared/workspace";
import { agentDisplayName, statusText } from "../../lib/workspace-agent-presentation";
import { Icon } from "../ui/workspace-icon";
import type { SettledWorktree } from "./space-rows";

function projectMonogram(label: string): string {
  const words = label.trim().split(/[\s_-]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toLocaleUpperCase() ?? "").join("") || "•";
}

function SpaceGroup({ project, worktree, agents, activeWorktreeId, activeAgentId, onSelectWorktree, onOpenAgent }: {
  readonly project: WorkspaceProject;
  readonly worktree: WorkspaceWorktree;
  readonly agents: readonly WorkspaceAgent[];
  readonly activeWorktreeId: string | undefined;
  readonly activeAgentId: string | undefined;
  readonly onSelectWorktree: (projectId: string, worktreeId: string) => void;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const working = agents.some((agent) => agent.status === "working");
  const groupId = `space-group-${encodeURIComponent(worktree.id)}`;
  return <section className="focused-worktree" data-current={worktree.id === activeWorktreeId || undefined}>
    <button
      type="button"
      className="focused-worktree-heading"
      aria-expanded={expanded}
      aria-controls={groupId}
      aria-label={`${expanded ? "Hide" : "Show"} Spaces in ${worktree.label}`}
      onClick={() => {
        onSelectWorktree(project.id, worktree.id);
        setExpanded((current) => !current);
      }}
    >
      <Icon name="chevron" />
      <Icon name="worktree-add" />
      <strong>{worktree.label}</strong>
      <small>{working ? "Live" : agents.length}</small>
    </button>
    <ul id={groupId} hidden={!expanded}>
      {expanded && agents.map((agent) => {
        const status = statusText(agent.status);
        const summary = agent.summary || status;
        return <li key={agent.id}>
          <button
            id={`workspace-agent-${encodeURIComponent(agent.id)}`}
            type="button"
            className={`focused-session-row ${agent.id === activeAgentId ? "active" : ""}`}
            aria-current={agent.id === activeAgentId ? "page" : undefined}
            aria-label={`${agent.name}, ${status}, ${summary}`}
            title={`${agent.name} — ${summary}`}
            onClick={() => onOpenAgent(agent)}
          >
            <span className="focused-session-copy">
              <span className="focused-session-title"><span className={`focused-status ${agent.status}`} aria-hidden="true" /><strong>{agentDisplayName(agent.name)}</strong></span>
              <small>{summary}</small>
            </span>
          </button>
        </li>;
      })}
      {expanded && agents.length === 0 && <li><button type="button" className="focused-session-row" onClick={() => onSelectWorktree(project.id, worktree.id)}><span className="focused-session-copy"><strong>New Space</strong><small>Start in this worktree</small></span></button></li>}
    </ul>
  </section>;
}

/** Desktop shell navigation with a project switcher and the selected repository's Space index. */
export function WorkspaceSidebar({ snapshot, activeProjectId, activeWorktreeId, activeAgentId, loading, failed, opening, archivingProjectId, openError, worktreeError, compact, open, onSelectProject, onSelectWorktree, onArchiveProject, onOpenAgent, onOpenDirectory }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly activeProjectId: string | undefined;
  readonly activeWorktreeId: string | undefined;
  readonly activeAgentId: string | undefined;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly opening: boolean;
  readonly archivingProjectId: string | undefined;
  readonly openError: string | undefined;
  readonly worktreeBusyOwner: string | undefined;
  readonly worktreeError: string | undefined;
  readonly compact: boolean;
  readonly open: boolean;
  readonly revealAgent: { readonly agentId: string; readonly requestId: number } | undefined;
  readonly performanceEnabled: boolean;
  readonly onTogglePerformance: () => void;
  readonly onClose: () => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly onSelectWorktree: (projectId: string, worktreeId: string) => void;
  readonly onArchiveProject: (project: WorkspaceProject) => void;
  readonly onCreateWorktree: (projectId: string, sourceWorktreeId: string, branch: string) => void;
  readonly onArchiveWorktree: (projectId: string, worktree: WorkspaceWorktree) => void;
  readonly onRestoreWorktree: (projectId: string, worktree: SettledWorktree) => void;
  readonly onRemoveWorktree: (projectId: string, worktree: SettledWorktree) => void;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
  readonly onOpenDirectory: () => void;
}) {
  const activeProject = snapshot.projects.find((project) => project.id === activeProjectId) ?? snapshot.projects[0];
  const worktrees = activeProject?.worktreeIds.flatMap((id) => snapshot.worktrees.find((worktree) => worktree.id === id) ?? []) ?? [];
  const rootAgents = snapshot.agents.filter((agent) => agent.runtimeKind === "root" && worktrees.some((worktree) => worktree.id === agent.worktreeId));
  return <>
    <nav className="project-rail" aria-label="Projects">
      <div className="traffic-light-space" aria-hidden="true" />
      <div className="project-rail-items">
        {snapshot.projects.map((project) => <button
          key={project.id}
          type="button"
          className={`project-rail-button ${project.id === activeProject?.id ? "active" : ""}`}
          aria-current={project.id === activeProject?.id ? "page" : undefined}
          aria-label={`Open ${project.label} repository`}
          title={project.path}
          onClick={() => onSelectProject(project.id)}
        >{projectMonogram(project.label)}</button>)}
        <button type="button" className="project-rail-button add" aria-label="Open repository" title="Open repository" disabled={opening} onClick={onOpenDirectory}><Icon name="folder-add" /></button>
      </div>
    </nav>
    <aside
      id="workspace-navigation"
      className="focused-project-panel"
      aria-label={activeProject ? `${activeProject.label} Spaces` : "Repository Spaces"}
      aria-hidden={compact && !open}
      inert={compact && !open ? true : undefined}
      data-open={open}
    >
      <header>
        <h2>{activeProject?.label ?? "Ernie Dev"}</h2>
        <p>{activeProject?.path ?? "Open a repository to start"}</p>
        {activeProject && snapshot.projects[0]?.id !== activeProject.id && <button type="button" className="focused-project-archive" aria-label={`Archive ${activeProject.label}`} title={`Archive ${activeProject.label}`} disabled={archivingProjectId === activeProject.id} onClick={() => onArchiveProject(activeProject)}><Icon name="archive" /></button>}
      </header>
      <div className="focused-project-content">
        <div className="focused-space-index-heading"><strong>Spaces</strong><small>{rootAgents.length}</small></div>
        {failed && <p className="focused-message error" role="alert">Spaces are temporarily unavailable. Ernie will retry automatically.</p>}
        {openError && <p className="focused-message error" role="alert">{openError}</p>}
        {worktreeError && <p className="focused-message error" role="alert">{worktreeError}</p>}
        {loading && !activeProject && <p className="focused-message" role="status">Loading repositories…</p>}
        {!loading && !activeProject && <p className="focused-message">Open a repository to create its first Space.</p>}
        {activeProject && worktrees.map((worktree) => <SpaceGroup
          key={worktree.id}
          project={activeProject}
          worktree={worktree}
          agents={rootAgents.filter((agent) => agent.worktreeId === worktree.id)}
          activeWorktreeId={activeWorktreeId}
          activeAgentId={activeAgentId}
          onSelectWorktree={onSelectWorktree}
          onOpenAgent={onOpenAgent}
        />)}
      </div>
    </aside>
  </>;
}
