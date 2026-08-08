import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { WorkspaceAgent, WorkspaceProject, WorkspaceSnapshot, WorkspaceWorktree } from "../../shared/workspace";
import { flattenAgentHierarchy } from "./ProjectSidebar";

function Icon({ name }: { readonly name: "add" | "branch" | "folder" | "close" }) {
  const paths: Record<typeof name, ReactNode> = {
    add: <path d="M10 4v12M4 10h12" />,
    branch: <><circle cx="6" cy="5" r="1.5" /><circle cx="14" cy="15" r="1.5" /><path d="M6 6.5v3.7a4.8 4.8 0 0 0 4.8 4.8h1.7M14 13.5V5" /></>,
    folder: <><path d="M2.8 5.5h5l1.5 1.7h7.9v7.7a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6z" /><path d="M2.8 7.2v-2A1.6 1.6 0 0 1 4.4 3.6h2.7l1.7 1.9" /></>,
    close: <path d="m6 6 8 8m0-8-8 8" />,
  };
  return <svg viewBox="0 0 20 20" aria-hidden="true">{paths[name]}</svg>;
}

function initials(label: string): string {
  const words = label.split(/[\s_-]+/u).filter(Boolean);
  return (words.length > 1 ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}` : label.slice(0, 2)).toUpperCase();
}

function projectForAgent(snapshot: WorkspaceSnapshot, agent: WorkspaceAgent): WorkspaceProject | undefined {
  return snapshot.projects.find((project) => project.worktreeIds.includes(agent.worktreeId));
}

function ActivityBar() {
  return <span className="running-track" aria-label="Running"><i /></span>;
}

function statusText(status: WorkspaceAgent["status"]): string {
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

function SessionRow({ agent, depth, active, onOpen }: {
  readonly agent: WorkspaceAgent;
  readonly depth: number;
  readonly active: boolean;
  readonly onOpen: (agent: WorkspaceAgent) => void;
}) {
  return <li>
    <button
      type="button"
      className={`focused-session-row ${active ? "active" : ""}`}
      style={{ paddingInlineStart: `${10 + depth * 15}px` }}
      aria-current={active ? "page" : undefined}
      onClick={() => onOpen(agent)}
    >
      <span className={`focused-status ${agent.status}`} aria-hidden="true" />
      <span className="focused-session-copy"><strong>{agent.name}</strong><small>{agent.summary || statusText(agent.status)}</small></span>
      {agent.status === "working" && <ActivityBar />}
    </button>
  </li>;
}

function WorktreeSessions({ worktree, agents, activeAgentId, onOpen }: {
  readonly worktree: WorkspaceWorktree;
  readonly agents: readonly WorkspaceAgent[];
  readonly activeAgentId: string | undefined;
  readonly onOpen: (agent: WorkspaceAgent) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const rows = useMemo(() => flattenAgentHierarchy(agents), [agents]);
  return <section className="focused-worktree">
    <button type="button" className="focused-worktree-heading" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
      <span className={`focused-chevron ${expanded ? "expanded" : ""}`}>›</span><Icon name="branch" /><strong>{worktree.label}</strong><small>{agents.length}</small>
    </button>
    {expanded && <ul>{rows.map(({ agent, depth }) => <SessionRow key={agent.id} agent={agent} depth={depth} active={agent.id === activeAgentId} onOpen={onOpen} />)}</ul>}
  </section>;
}

function ProjectRail({ projects, activeProjectId, opening, onSelect, onOpenDirectory }: {
  readonly projects: readonly WorkspaceProject[];
  readonly activeProjectId: string | undefined;
  readonly opening: boolean;
  readonly onSelect: (projectId: string) => void;
  readonly onOpenDirectory: () => void;
}) {
  return <nav className="project-rail" aria-label="Open projects">
    <div className="traffic-light-space" aria-hidden="true" />
    <div className="project-rail-items">
      {projects.map((project) => <button key={project.id} type="button" className={`project-rail-button ${project.id === activeProjectId ? "active" : ""}`} aria-current={project.id === activeProjectId ? "page" : undefined} aria-label={project.label} title={project.path} onClick={() => onSelect(project.id)}>{initials(project.label)}</button>)}
    </div>
    <button type="button" className="project-rail-button add" aria-label="Open folder" title="Open folder" disabled={opening} onClick={onOpenDirectory}><Icon name="add" /></button>
  </nav>;
}

function SessionTabs({ snapshot, openAgentIds, activeAgentId, onSelect, onClose }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly openAgentIds: readonly string[];
  readonly activeAgentId: string | undefined;
  readonly onSelect: (agentId: string) => void;
  readonly onClose: (agentId: string) => void;
}) {
  return <div className="focused-tabstrip" role="tablist" aria-label="Open sessions">
    {openAgentIds.map((agentId) => {
      const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
      const project = agent ? projectForAgent(snapshot, agent) : undefined;
      const title = agent?.name ?? "Detached session";
      return <div key={agentId} className={`focused-tab-shell ${agentId === activeAgentId ? "active" : ""}`}>
        <button type="button" role="tab" aria-selected={agentId === activeAgentId} className="focused-tab" onClick={() => onSelect(agentId)}>
          <span className={`focused-status ${agent?.status ?? "disconnected"}`} aria-hidden="true" />
          <span>{title}{project ? ` · ${project.label}` : ""}</span>
        </button>
        <button type="button" className="focused-tab-close" aria-label={`Close ${title}`} onClick={() => onClose(agentId)}><Icon name="close" /></button>
      </div>;
    })}
  </div>;
}

function SessionSurface({ snapshot, agentId }: { readonly snapshot: WorkspaceSnapshot; readonly agentId: string | undefined }) {
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  if (agentId === undefined) return <main className="focused-surface empty"><div><Icon name="folder" /><h1>Choose a session</h1><p>Select a session from the focused project navigator.</p></div></main>;
  if (!agent) return <main className="focused-surface empty"><div><h1>Session unavailable</h1><p>This tab is detached. Closing it will not stop or delete the saved session.</p></div></main>;
  const project = projectForAgent(snapshot, agent);
  const worktree = snapshot.worktrees.find((candidate) => candidate.id === agent.worktreeId);
  return <main className="focused-surface">
    <div className="focused-breadcrumb"><span>{project?.label ?? "Project"}</span><span>›</span><span>{worktree?.label ?? "Directory"}</span><span>›</span><strong>{agent.name}</strong></div>
    <section className="focused-session-overview">
      <h1>{agent.name}</h1>
      <p>{agent.summary || "No task summary is available for this session."}</p>
      <div className={`focused-run-state ${agent.status}`}><strong>{statusText(agent.status)}</strong>{agent.status === "working" && <ActivityBar />}</div>
    </section>
  </main>;
}

export function FocusedWorkspace({ snapshot, failed, onSnapshot }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly failed: boolean;
  readonly onSnapshot: (snapshot: WorkspaceSnapshot) => void;
}) {
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(snapshot.projects[0]?.id);
  const [openAgentIds, setOpenAgentIds] = useState<readonly string[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | undefined>();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | undefined>();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || snapshot.agents.length === 0) return;
    initialized.current = true;
    const initial = snapshot.agents.find((agent) => agent.status === "working") ?? snapshot.agents[0];
    if (!initial) return;
    setOpenAgentIds([initial.id]);
    setActiveAgentId(initial.id);
    setActiveProjectId(projectForAgent(snapshot, initial)?.id);
  }, [snapshot]);

  useEffect(() => {
    if (activeProjectId !== undefined && snapshot.projects.some((project) => project.id === activeProjectId)) return;
    setActiveProjectId(snapshot.projects[0]?.id);
  }, [activeProjectId, snapshot.projects]);

  const activeProject = snapshot.projects.find((project) => project.id === activeProjectId);
  const projectWorktrees = activeProject
    ? activeProject.worktreeIds.flatMap((id) => snapshot.worktrees.find((worktree) => worktree.id === id) ?? [])
    : [];
  const openAgent = (agent: WorkspaceAgent) => {
    setOpenAgentIds((ids) => ids.includes(agent.id) ? ids : [...ids, agent.id]);
    setActiveAgentId(agent.id);
  };
  const closeAgent = (agentId: string) => {
    setOpenAgentIds((ids) => {
      const index = ids.indexOf(agentId);
      const next = ids.filter((id) => id !== agentId);
      if (agentId === activeAgentId) setActiveAgentId(next[Math.min(index, next.length - 1)] ?? next[0]);
      return next;
    });
  };
  const openDirectory = async () => {
    setOpening(true);
    setOpenError(undefined);
    try {
      const result = await window.ernie.openProjectDirectory();
      if (!result.ok) { setOpenError(result.error); return; }
      if (!result.cancelled) {
        onSnapshot(result.snapshot);
        setActiveProjectId(result.snapshot.projects.at(-1)?.id);
      }
    } finally { setOpening(false); }
  };

  return <div className="focused-workspace">
    <ProjectRail projects={snapshot.projects} activeProjectId={activeProjectId} opening={opening} onSelect={setActiveProjectId} onOpenDirectory={() => { void openDirectory(); }} />
    <aside className="focused-project-panel" aria-label={activeProject ? `${activeProject.label} sessions` : "Project sessions"}>
      <header><h2>{activeProject?.label ?? "Projects"}</h2><p title={activeProject?.path}>{activeProject?.path ?? "Open a folder to begin."}</p></header>
      <div className="focused-project-content">
        {failed && <p className="focused-message">Unable to refresh projects. Ernie will retry automatically.</p>}
        {openError && <p className="focused-message error">{openError}</p>}
        {!failed && activeProject && projectWorktrees.length === 0 && <p className="focused-message">No worktrees are available in this directory.</p>}
        {!activeProject && <button type="button" className="open-first-project" onClick={() => { void openDirectory(); }}>Open folder…</button>}
        {projectWorktrees.map((worktree) => <WorktreeSessions key={worktree.id} worktree={worktree} agents={snapshot.agents.filter((agent) => agent.worktreeId === worktree.id)} activeAgentId={activeAgentId} onOpen={openAgent} />)}
      </div>
    </aside>
    <section className="focused-main-column">
      <div className="focused-titlebar-drag" aria-hidden="true" />
      <SessionTabs snapshot={snapshot} openAgentIds={openAgentIds} activeAgentId={activeAgentId} onSelect={setActiveAgentId} onClose={closeAgent} />
      <SessionSurface snapshot={snapshot} agentId={activeAgentId} />
    </section>
  </div>;
}
