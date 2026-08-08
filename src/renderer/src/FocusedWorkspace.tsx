import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AgentState } from "../../shared/contract";
import type { WorkspaceAgent, WorkspaceProject, WorkspaceSnapshot, WorkspaceWorktree } from "../../shared/workspace";
import { flattenAgentHierarchy } from "./ProjectSidebar";
import { LiveSessionChatSurface, SessionChatSurface } from "./SessionChatSurface";
import type { ThreadItem } from "./transcript";
import { prioritizeAgents } from "./agentPriority";

function Icon({ name }: { readonly name: "add" | "branch" | "folder" | "close" }) {
  const paths: Record<typeof name, ReactNode> = {
    add: <path d="M10 4v12M4 10h12" />,
    branch: <><circle cx="6" cy="5" r="1.5" /><circle cx="14" cy="15" r="1.5" /><path d="M6 6.5v3.7a4.8 4.8 0 0 0 4.8 4.8h1.7M14 13.5V5" /></>,
    folder: <><path d="M2.8 5.5h5l1.5 1.7h7.9v7.7a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6z" /><path d="M2.8 7.2v-2A1.6 1.6 0 0 1 4.4 3.6h2.7l1.7 1.9" /></>,
    close: <path d="m6 6 8 8m0-8-8 8" />,
  };
  return <svg viewBox="0 0 20 20" aria-hidden="true">{paths[name]}</svg>;
}

function projectForAgent(snapshot: WorkspaceSnapshot, agent: WorkspaceAgent): WorkspaceProject | undefined {
  return snapshot.projects.find((project) => project.worktreeIds.includes(agent.worktreeId));
}

function isCommandableAgent(agent: WorkspaceAgent, state: AgentState): boolean {
  return state.sessionId.length > 0
    && (agent.sessionId === state.sessionId || agent.id === state.sessionId || agent.activeSessionId === state.sessionId);
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

function SessionRow({ agent, depth, active, context, onOpen }: {
  readonly agent: WorkspaceAgent;
  readonly depth: number;
  readonly active: boolean;
  readonly context?: string;
  readonly onOpen: (agent: WorkspaceAgent) => void;
}) {
  return <li>
    <button
      type="button"
      className={`focused-session-row ${active ? "active" : ""}`}
      style={{ paddingInlineStart: `${9 + depth * 15}px` }}
      aria-current={active ? "page" : undefined}
      onClick={() => onOpen(agent)}
    >
      <span className={`focused-status ${agent.status}`} aria-hidden="true" />
      <span className="focused-session-copy"><strong>{agent.name}</strong><small>{context ?? (agent.summary || statusText(agent.status))}</small></span>
      {agent.status === "working" && <ActivityBar />}
    </button>
  </li>;
}

function ProjectNode({ project, worktrees, active, hasWorkingSession, onSelect }: {
  readonly project: WorkspaceProject;
  readonly worktrees: readonly WorkspaceWorktree[];
  readonly active: boolean;
  readonly hasWorkingSession: boolean;
  readonly onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(active);
  useEffect(() => { if (active) setExpanded(true); }, [active]);
  return <li className="workspace-project-node">
    <button type="button" className={`workspace-project-row ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} aria-expanded={expanded} title={project.path} onClick={() => { onSelect(); setExpanded((value) => active ? !value : true); }}>
      <span className={`focused-chevron ${expanded ? "expanded" : ""}`}>›</span>
      <span className={`workspace-project-mark ${hasWorkingSession ? "working" : ""}`} aria-hidden="true" />
      <strong>{project.label}</strong>
      <small>{worktrees.length}</small>
    </button>
    {expanded && <ul className="workspace-worktree-list">{worktrees.map((worktree) => <li key={worktree.id}><Icon name="branch" /><span>{worktree.label}</span></li>)}</ul>}
  </li>;
}

type AgentView = "agents" | "priority";

function agentContext(snapshot: WorkspaceSnapshot, agent: WorkspaceAgent): string {
  const project = projectForAgent(snapshot, agent);
  const worktree = snapshot.worktrees.find((candidate) => candidate.id === agent.worktreeId);
  return [project?.label, worktree?.label].filter(Boolean).join(" · ") || statusText(agent.status);
}

function AgentPane({ snapshot, view, activeAgentId, onOpenAgent }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly view: AgentView;
  readonly activeAgentId: string | undefined;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  const rows = view === "priority"
    ? prioritizeAgents(snapshot.agents)
      .map((agent) => ({ agent, depth: 0, context: `${statusText(agent.status)} · ${agentContext(snapshot, agent)}` }))
    : snapshot.projects.flatMap((project) => project.worktreeIds.flatMap((worktreeId) => {
      const worktree = snapshot.worktrees.find((candidate) => candidate.id === worktreeId);
      if (!worktree) return [];
      return flattenAgentHierarchy(snapshot.agents.filter((agent) => agent.worktreeId === worktreeId))
        .map(({ agent, depth }) => ({ agent, depth, context: `${project.label} · ${worktree.label}` }));
    }));
  if (rows.length === 0) return <p className="focused-message">{view === "priority" ? "Nothing needs attention right now." : "No agents are available yet."}</p>;
  return <ul className="workspace-agent-list">{rows.map(({ agent, depth, context }) => <SessionRow key={agent.id} agent={agent} depth={depth} context={context} active={agent.id === activeAgentId} onOpen={onOpenAgent} />)}</ul>;
}

function WorkspaceSidebar({ snapshot, activeProjectId, activeAgentId, loading, failed, opening, openError, onSelectProject, onOpenAgent, onOpenDirectory }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly activeProjectId: string | undefined;
  readonly activeAgentId: string | undefined;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly opening: boolean;
  readonly openError: string | undefined;
  readonly onSelectProject: (projectId: string) => void;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
  readonly onOpenDirectory: () => void;
}) {
  const [agentView, setAgentView] = useState<AgentView>("agents");
  const activeProject = snapshot.projects.find((project) => project.id === activeProjectId);
  const priorityCount = prioritizeAgents(snapshot.agents).length;
  return <aside className="workspace-sidebar" aria-label="Spaces and agents">
    <header className="workspace-sidebar-title"><strong>ernie</strong><span>{activeProject?.path ?? "Local agent workspace"}</span></header>
    <section className="workspace-projects" aria-labelledby="spaces-heading">
      <div className="workspace-section-heading"><h2 id="spaces-heading">Spaces</h2><button type="button" aria-label="Open folder" title="Open folder" disabled={opening} onClick={onOpenDirectory}><Icon name="add" /></button></div>
      <div className="workspace-project-scroll">
        {failed && <p className="focused-message">Spaces are temporarily unavailable. Ernie will retry automatically.</p>}
        {openError && <p className="focused-message error">{openError}</p>}
        {loading && snapshot.projects.length === 0 && <p className="focused-message">Loading spaces…</p>}
        {!loading && snapshot.projects.length === 0 && <div className="focused-first-project"><p>No spaces yet.</p><button type="button" className="open-first-project" onClick={onOpenDirectory}>Open folder…</button></div>}
        <ul className="workspace-project-list">{snapshot.projects.map((project) => {
          const worktrees = project.worktreeIds.flatMap((id) => snapshot.worktrees.find((worktree) => worktree.id === id) ?? []);
          const hasWorkingSession = snapshot.agents.some((agent) => worktrees.some((worktree) => worktree.id === agent.worktreeId) && agent.status === "working");
          return <ProjectNode key={project.id} project={project} worktrees={worktrees} active={project.id === activeProjectId} hasWorkingSession={hasWorkingSession} onSelect={() => onSelectProject(project.id)} />;
        })}</ul>
      </div>
    </section>
    <section className="workspace-sessions" aria-label={agentView === "agents" ? "Agents" : "Priority queue"}>
      <div className="workspace-agent-tabs" role="tablist" aria-label="Agent views">
        <button type="button" role="tab" aria-selected={agentView === "agents"} className={agentView === "agents" ? "active" : ""} onClick={() => setAgentView("agents")}>Agents</button>
        <button type="button" role="tab" aria-selected={agentView === "priority"} className={agentView === "priority" ? "active" : ""} onClick={() => setAgentView("priority")}>Priority <span>{priorityCount}</span></button>
      </div>
      <div className="workspace-session-scroll"><AgentPane snapshot={snapshot} view={agentView} activeAgentId={activeAgentId} onOpenAgent={onOpenAgent} /></div>
    </section>
    <footer className="workspace-sidebar-footer"><button type="button" disabled={opening} onClick={onOpenDirectory}><Icon name="add" /><span>{opening ? "Opening…" : "Open folder"}</span></button></footer>
  </aside>;
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

function SessionSurface({ snapshot, agentId, loading, activeProject, agentState, liveItems, onAppendLiveUser }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly agentId: string | undefined;
  readonly loading: boolean;
  readonly activeProject: WorkspaceProject | undefined;
  readonly agentState: AgentState;
  readonly liveItems: readonly ThreadItem[];
  readonly onAppendLiveUser: (text: string) => void;
}) {
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  if (loading) return <main className="focused-surface empty"><div><h1>Loading workspace…</h1><p>Finding your projects and Prime Agent sessions.</p></div></main>;
  if (agentId === undefined) return <main className="focused-surface empty"><div><Icon name="folder" /><h1>No session open</h1><p>{activeProject ? `Select a session in ${activeProject.label} to open its conversation.` : "Open a folder to add your first project."}</p></div></main>;
  if (!agent) return <main className="focused-surface empty"><div><h1>Session no longer available</h1><p>Ernie can’t find this session in its project. Closing this tab won’t delete saved work.</p></div></main>;
  const project = projectForAgent(snapshot, agent);
  const worktree = snapshot.worktrees.find((candidate) => candidate.id === agent.worktreeId);
  if (agent.id.startsWith("rpc:")) return <LiveSessionChatSurface agent={agent} state={agentState} items={liveItems} onAppendUser={onAppendLiveUser} projectLabel={project?.label ?? "Project"} worktreeLabel={worktree?.label ?? "Directory"} />;
  return <SessionChatSurface agent={agent} state={agentState} interactive={isCommandableAgent(agent, agentState)} projectLabel={project?.label ?? "Project"} worktreeLabel={worktree?.label ?? "Directory"} />;
}

export function FocusedWorkspace({ snapshot, agentState, liveItems, onAppendLiveUser, failed, loading, onSnapshot }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly agentState: AgentState;
  readonly liveItems: readonly ThreadItem[];
  readonly onAppendLiveUser: (text: string) => void;
  readonly failed: boolean;
  readonly loading: boolean;
  readonly onSnapshot: (snapshot: WorkspaceSnapshot) => void;
}) {
  const catalogCommandable = snapshot.agents.find((agent) => isCommandableAgent(agent, agentState));
  const rootWorktreeId = snapshot.projects[0]?.worktreeIds[0] ?? snapshot.worktrees[0]?.id;
  const liveAgent: WorkspaceAgent | undefined = !catalogCommandable && rootWorktreeId !== undefined ? {
    id: `rpc:${agentState.sessionId || "current"}`, sessionId: agentState.sessionId, worktreeId: rootWorktreeId,
    name: agentState.sessionName || "New conversation", summary: agentState.detail,
    status: agentState.isStreaming ? "working" : agentState.connection === "ready" ? "idle" : agentState.connection === "failed" ? "failed" : "waiting",
    runtimeKind: "root",
  } : undefined;
  const workspace: WorkspaceSnapshot = liveAgent ? { ...snapshot, agents: [liveAgent, ...snapshot.agents] } : snapshot;
  const currentAgentId = catalogCommandable?.id ?? liveAgent?.id;
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(snapshot.projects[0]?.id);
  const [openAgentIds, setOpenAgentIds] = useState<readonly string[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | undefined>();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | undefined>();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || workspace.agents.length === 0) return;
    initialized.current = true;
    const initial = workspace.agents.find((agent) => agent.id.startsWith("rpc:")) ?? workspace.agents.find((agent) => isCommandableAgent(agent, agentState)) ?? workspace.agents.find((agent) => agent.status === "working") ?? workspace.agents[0];
    if (!initial) return;
    setOpenAgentIds([initial.id]); setActiveAgentId(initial.id); setActiveProjectId(projectForAgent(workspace, initial)?.id);
  }, [agentState.sessionId, workspace]);

  useEffect(() => {
    if (!currentAgentId) return;
    setOpenAgentIds((ids) => ids.map((id) => id.startsWith("rpc:") ? currentAgentId : id).filter((id, index, all) => all.indexOf(id) === index));
    setActiveAgentId((id) => id?.startsWith("rpc:") ? currentAgentId : id);
  }, [currentAgentId]);

  useEffect(() => {
    if (activeProjectId !== undefined && snapshot.projects.some((project) => project.id === activeProjectId)) return;
    setActiveProjectId(snapshot.projects[0]?.id);
  }, [activeProjectId, snapshot.projects]);

  const activeProject = workspace.projects.find((project) => project.id === activeProjectId);
  const openAgent = (agent: WorkspaceAgent) => {
    setOpenAgentIds((ids) => ids.includes(agent.id) ? ids : [...ids, agent.id]);
    setActiveAgentId(agent.id);
    setActiveProjectId(projectForAgent(workspace, agent)?.id);
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
    setOpening(true); setOpenError(undefined);
    try {
      const result = await window.ernie.openProjectDirectory();
      if (!result.ok) { setOpenError(result.error); return; }
      if (!result.cancelled) { onSnapshot(result.snapshot); setActiveProjectId(result.snapshot.projects.at(-1)?.id); }
    } finally { setOpening(false); }
  };

  return <div className="focused-workspace">
    <WorkspaceSidebar snapshot={workspace} activeProjectId={activeProjectId} activeAgentId={activeAgentId} loading={loading} failed={failed} opening={opening} openError={openError} onSelectProject={setActiveProjectId} onOpenAgent={openAgent} onOpenDirectory={() => { void openDirectory(); }} />
    <section className="focused-main-column">
      <div className="focused-titlebar-drag" aria-hidden="true" />
      <SessionTabs snapshot={workspace} openAgentIds={openAgentIds} activeAgentId={activeAgentId} onSelect={setActiveAgentId} onClose={closeAgent} />
      <SessionSurface snapshot={workspace} agentId={activeAgentId} loading={loading} activeProject={activeProject} agentState={agentState} liveItems={liveItems} onAppendLiveUser={onAppendLiveUser} />
    </section>
  </div>;
}
