import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import type { AgentState } from "../../shared/contract";
import type { WorkspaceAgent, WorkspaceProject, WorkspaceSnapshot, WorkspaceWorktree } from "../../shared/workspace";
import { flattenAgentHierarchy } from "./ProjectSidebar";
import { LiveSessionChatSurface, SessionChatSurface } from "./SessionChatSurface";
import type { ThreadItem } from "./transcript";
import { prioritizeAgents } from "./agentPriority";
import {
  closeSpaceSessionTab,
  emptySpaceSessionTabs,
  openSpaceSessionTab,
  reconcileProvisionalSessionTabs,
  selectSpaceSessionTab,
  tabsForSpace,
} from "./spaceSessionTabs";

type IconName = "close" | "folder-add" | "sidebar";

const ICON_PATHS: Record<IconName, ReactNode> = {
  close: <path d="m6 6 8 8m0-8-8 8" />,
  "folder-add": <path d="M12 10v6m-3-3h6m5 7a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  sidebar: <><rect x="2.5" y="2.5" width="15" height="15" rx="2" /><path d="M7.5 2.5v15m4-10 3 2.5-3 2.5" /></>,
};

function Icon({ name }: { readonly name: IconName }) {
  const usesLucideGrid = name === "folder-add";
  return <svg viewBox={usesLucideGrid ? "0 0 24 24" : "0 0 20 20"} aria-hidden="true">{ICON_PATHS[name]}</svg>;
}

function projectForAgent(snapshot: WorkspaceSnapshot, agent: WorkspaceAgent): WorkspaceProject | undefined {
  return snapshot.projects.find((project) => project.worktreeIds.includes(agent.worktreeId));
}

/** Preserves catalog order while projecting every agent contained by a space. */
export function agentsForProject(project: WorkspaceProject, agents: readonly WorkspaceAgent[]): readonly WorkspaceAgent[] {
  const worktreeIds = new Set(project.worktreeIds);
  return agents.filter((agent) => worktreeIds.has(agent.worktreeId));
}

function isCommandableAgent(agent: WorkspaceAgent, sessionId: string): boolean {
  return sessionId.length > 0
    && (agent.sessionId === sessionId || agent.id === sessionId || agent.activeSessionId === sessionId);
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

function SessionRow({ agent, active, context, onOpen }: {
  readonly agent: WorkspaceAgent;
  readonly active: boolean;
  readonly context: string;
  readonly onOpen: (agent: WorkspaceAgent) => void;
}) {
  const status = statusText(agent.status);
  const isSubagent = agent.runtimeKind === "subagent";
  const fullLabel = [agent.name, isSubagent ? "Subagent" : undefined, status, context].filter(Boolean).join(" — ");
  return <button
    type="button"
    className={`focused-session-row ${isSubagent ? "subagent" : "root-agent"} ${active ? "active" : ""}`}
    aria-current={active ? "page" : undefined}
    aria-label={fullLabel}
    title={fullLabel}
    onClick={() => onOpen(agent)}
  >
    <span className={`focused-status ${agent.status}`} aria-hidden="true" />
    <span className="focused-session-copy">
      <span className="focused-session-title"><strong>{agent.name}</strong>{isSubagent && <span className="focused-session-kind">Subagent</span>}</span>
      <small className="focused-session-meta"><span>{status}</span><span>{context}</span></small>
    </span>
    {agent.status === "working" && <ActivityBar />}
  </button>;
}

function ProjectNode({ project, worktrees, agents, active, activeAgentId, onSelect, onOpenAgent }: {
  readonly project: WorkspaceProject;
  readonly worktrees: readonly WorkspaceWorktree[];
  readonly agents: readonly WorkspaceAgent[];
  readonly active: boolean;
  readonly activeAgentId: string | undefined;
  readonly onSelect: () => void;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  const [expanded, setExpanded] = useState(active);
  useEffect(() => { if (active) setExpanded(true); }, [active]);
  const worktreeLabels = new Map(worktrees.map((worktree) => [worktree.id, worktree.label]));
  const trees = agentTree(agents, (agent) => worktreeLabels.get(agent.worktreeId) ?? "Detached worktree");
  const hasWorkingAgent = agents.some((agent) => agent.status === "working");
  const agentCount = `${agents.length} ${agents.length === 1 ? "agent" : "agents"}`;
  return <li className="workspace-project-node">
    <button type="button" className={`workspace-project-row ${active ? "active" : ""}`} aria-current={active ? "page" : undefined} aria-expanded={expanded} title={project.path} onClick={() => { onSelect(); setExpanded((value) => active ? !value : true); }}>
      <span className={`focused-chevron ${expanded ? "expanded" : ""}`} aria-hidden="true">›</span>
      <span className={`workspace-project-mark ${hasWorkingAgent ? "working" : ""}`} aria-hidden="true" />
      <strong>{project.label}</strong>
      <small>{agentCount}{hasWorkingAgent ? " · Working" : ""}</small>
    </button>
    {expanded && (trees.length > 0
      ? <ul className="workspace-space-agent-list" aria-label={`Agents in ${project.label}`}>{trees.map((node) => <AgentTreeRow key={node.agent.id} node={node} activeAgentId={activeAgentId} onOpenAgent={onOpenAgent} />)}</ul>
      : <p className="workspace-space-empty">No agents in this space.</p>)}
  </li>;
}

type AgentView = "agents" | "priority";

function horizontalTabStep(event: KeyboardEvent<HTMLButtonElement>): -1 | 1 | undefined {
  const rtl = window.getComputedStyle(event.currentTarget).direction === "rtl";
  if (event.key === "ArrowLeft") return rtl ? 1 : -1;
  if (event.key === "ArrowRight") return rtl ? -1 : 1;
  return undefined;
}

function trapDrawerFocus(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Tab") return;
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled):not([tabindex='-1']),[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex='-1'])")];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function AgentViewTabs({ value, priorityCount, onChange }: {
  readonly value: AgentView;
  readonly priorityCount: number;
  readonly onChange: (view: AgentView) => void;
}) {
  const allRef = useRef<HTMLButtonElement>(null);
  const priorityRef = useRef<HTMLButtonElement>(null);
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = horizontalTabStep(event);
    const next = event.key === "Home" ? "agents"
      : event.key === "End" ? "priority"
      : step !== undefined ? value === "agents" ? "priority" : "agents"
      : undefined;
    if (!next) return;
    event.preventDefault();
    onChange(next);
    (next === "agents" ? allRef : priorityRef).current?.focus();
  };
  return <div className="workspace-agent-tabs" role="tablist" aria-label="Agent views">
    <button ref={allRef} id="all-agents-tab" type="button" role="tab" aria-controls="agent-list-panel" aria-selected={value === "agents"} className={value === "agents" ? "active" : ""} tabIndex={value === "agents" ? 0 : -1} onClick={() => onChange("agents")} onKeyDown={moveFocus}>Grouped</button>
    <button ref={priorityRef} id="priority-tab" type="button" role="tab" aria-controls="agent-list-panel" aria-selected={value === "priority"} aria-label={`Priority, ${priorityCount} agents`} className={value === "priority" ? "active" : ""} tabIndex={value === "priority" ? 0 : -1} onClick={() => onChange("priority")} onKeyDown={moveFocus}>Priority <span aria-hidden="true">{priorityCount}</span></button>
  </div>;
}

function FirstSpacePrompt({ opening, onOpen }: {
  readonly opening: boolean;
  readonly onOpen: () => void;
}) {
  return <div className="focused-first-project">
    <strong>No spaces yet</strong>
    <p>Open a local folder to create your first space.</p>
    <button type="button" className="open-first-project" disabled={opening} onClick={onOpen}><Icon name="folder-add" /><span>{opening ? "Opening folder…" : "Open folder"}</span></button>
  </div>;
}

function agentContext(snapshot: WorkspaceSnapshot, agent: WorkspaceAgent): string {
  const project = projectForAgent(snapshot, agent);
  const worktree = snapshot.worktrees.find((candidate) => candidate.id === agent.worktreeId);
  return [project?.label, worktree?.label].filter(Boolean).join(" · ") || statusText(agent.status);
}

interface AgentTreeNode {
  readonly agent: WorkspaceAgent;
  readonly context: string;
  readonly children: AgentTreeNode[];
}

function agentTree(agents: readonly WorkspaceAgent[], contextForAgent: (agent: WorkspaceAgent) => string): readonly AgentTreeNode[] {
  const roots: AgentTreeNode[] = [];
  const stack: AgentTreeNode[] = [];
  for (const { agent, depth } of flattenAgentHierarchy(agents)) {
    const node: AgentTreeNode = { agent, context: contextForAgent(agent), children: [] };
    if (depth === 0) roots.push(node);
    else stack[depth - 1]?.children.push(node);
    stack.length = depth;
    stack.push(node);
  }
  return roots;
}

function AgentTreeRow({ node, activeAgentId, onOpenAgent }: {
  readonly node: AgentTreeNode;
  readonly activeAgentId: string | undefined;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  return <li>
    <SessionRow agent={node.agent} context={node.context} active={node.agent.id === activeAgentId} onOpen={onOpenAgent} />
    {node.children.length > 0 && <ul className="workspace-agent-children" aria-label={`Subagents of ${node.agent.name}`}>
      {node.children.map((child) => <AgentTreeRow key={child.agent.id} node={child} activeAgentId={activeAgentId} onOpenAgent={onOpenAgent} />)}
    </ul>}
  </li>;
}

function AgentPane({ snapshot, view, activeAgentId, onOpenAgent }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly view: AgentView;
  readonly activeAgentId: string | undefined;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  if (view === "priority") {
    const agents = prioritizeAgents(snapshot.agents);
    if (agents.length === 0) return <p className="focused-message">Nothing needs attention right now.</p>;
    return <ul className="workspace-agent-list">{agents.map((agent) => <li key={agent.id}>
      <SessionRow agent={agent} context={agentContext(snapshot, agent)} active={agent.id === activeAgentId} onOpen={onOpenAgent} />
    </li>)}</ul>;
  }
  const trees = snapshot.projects.flatMap((project) => project.worktreeIds.flatMap((worktreeId) => {
    const worktree = snapshot.worktrees.find((candidate) => candidate.id === worktreeId);
    return worktree ? agentTree(snapshot.agents.filter((agent) => agent.worktreeId === worktreeId), () => `${project.label} · ${worktree.label}`) : [];
  }));
  if (trees.length === 0) return <p className="focused-message">No agents are available yet.</p>;
  return <ul className="workspace-agent-list">{trees.map((node) => <AgentTreeRow key={node.agent.id} node={node} activeAgentId={activeAgentId} onOpenAgent={onOpenAgent} />)}</ul>;
}

function WorkspaceSidebar({ snapshot, activeProjectId, activeAgentId, loading, failed, opening, openError, compact, open, onClose, onSelectProject, onOpenAgent, onOpenDirectory }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly activeProjectId: string | undefined;
  readonly activeAgentId: string | undefined;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly opening: boolean;
  readonly openError: string | undefined;
  readonly compact: boolean;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
  readonly onOpenDirectory: () => void;
}) {
  const [agentView, setAgentView] = useState<AgentView>("agents");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!compact || !open) return;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [compact, open]);
  const activeProject = snapshot.projects.find((project) => project.id === activeProjectId);
  const priorityCount = prioritizeAgents(snapshot.agents).length;
  return <aside
    id="workspace-navigation"
    className="workspace-sidebar"
    role={compact ? "dialog" : undefined}
    aria-label={compact ? undefined : "Workspace navigation"}
    aria-labelledby={compact ? "workspace-navigation-title" : undefined}
    aria-modal={compact && open ? true : undefined}
    aria-hidden={compact && !open}
    inert={compact && !open ? true : undefined}
    data-open={open}
    onKeyDown={compact && open ? trapDrawerFocus : undefined}
  >
    <header className="workspace-sidebar-title">
      <strong id="workspace-navigation-title">Ernie Dev</strong><span>{activeProject?.path ?? "Local agent workspace"}</span>
      <button ref={closeButtonRef} type="button" className="workspace-sidebar-close" aria-label="Close workspace navigation" onClick={onClose}><Icon name="close" /></button>
    </header>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">Workspace status: {loading ? "Loading spaces" : failed ? "Spaces unavailable; retrying automatically" : "Spaces available"}</div>
    <div className="workspace-sidebar-body">
      <section id="spaces-panel" className="workspace-projects" aria-labelledby="spaces-heading">
        <header className="workspace-section-heading">
          <h2 id="spaces-heading">Spaces</h2>
          <button type="button" aria-label="Open folder" title="Open folder" disabled={opening} onClick={onOpenDirectory}><Icon name="folder-add" /></button>
        </header>
        <div className="workspace-project-scroll">
          {failed && <p className="focused-message error" role="alert">Spaces are temporarily unavailable. Ernie will retry automatically.</p>}
          {openError && <p className="focused-message error" role="alert">{openError}</p>}
          {loading && snapshot.projects.length === 0 && <p className="focused-message" role="status">Loading spaces…</p>}
          {!loading && snapshot.projects.length === 0 && <FirstSpacePrompt opening={opening} onOpen={onOpenDirectory} />}
          <ul className="workspace-project-list">{snapshot.projects.map((project) => {
            const worktrees = project.worktreeIds.flatMap((id) => snapshot.worktrees.find((worktree) => worktree.id === id) ?? []);
            const agents = agentsForProject(project, snapshot.agents);
            return <ProjectNode key={project.id} project={project} worktrees={worktrees} agents={agents} active={project.id === activeProjectId} activeAgentId={activeAgentId} onSelect={() => onSelectProject(project.id)} onOpenAgent={onOpenAgent} />;
          })}</ul>
        </div>
      </section>
      <div className="workspace-section-divider" aria-hidden="true" />
      <section id="agents-panel" className="workspace-sessions" aria-labelledby="agents-heading">
        <header className="workspace-section-heading agent-heading"><h2 id="agents-heading">Agents</h2><AgentViewTabs value={agentView} priorityCount={priorityCount} onChange={setAgentView} /></header>
        <div id="agent-list-panel" className="workspace-session-scroll" role="tabpanel" aria-labelledby={agentView === "agents" ? "all-agents-tab" : "priority-tab"}><AgentPane snapshot={snapshot} view={agentView} activeAgentId={activeAgentId} onOpenAgent={onOpenAgent} /></div>
      </section>
    </div>
  </aside>;
}

function SessionTabs({ snapshot, spaceLabel, openAgentIds, activeAgentId, navigationOpen, navigationToggleRef, emptyFocusRef, onToggleNavigation, onSelect, onClose }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly spaceLabel: string | undefined;
  readonly openAgentIds: readonly string[];
  readonly activeAgentId: string | undefined;
  readonly navigationOpen: boolean;
  readonly navigationToggleRef: RefObject<HTMLButtonElement | null>;
  readonly emptyFocusRef: RefObject<HTMLElement | null>;
  readonly onToggleNavigation: () => void;
  readonly onSelect: (agentId: string) => void;
  readonly onClose: (agentId: string) => void;
}) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusTab = (agentId: string) => requestAnimationFrame(() => tabRefs.current.get(agentId)?.focus());
  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, agentId: string) => {
    const index = openAgentIds.indexOf(agentId);
    if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const step = horizontalTabStep(event) ?? 0;
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? openAgentIds.length - 1
      : (index + step + openAgentIds.length) % openAgentIds.length;
    const nextId = openAgentIds[nextIndex];
    if (!nextId) return;
    onSelect(nextId);
    focusTab(nextId);
  };
  const closeTab = (agentId: string) => {
    const index = openAgentIds.indexOf(agentId);
    const focusId = agentId === activeAgentId ? openAgentIds[index + 1] ?? openAgentIds[index - 1] : activeAgentId;
    onClose(agentId);
    if (focusId) focusTab(focusId);
    else requestAnimationFrame(() => emptyFocusRef.current?.focus());
  };
  return <div className="focused-titlebar-tabs">
    <button ref={navigationToggleRef} type="button" className="workspace-navigation-toggle" aria-label={navigationOpen ? "Close workspace navigation" : "Open workspace navigation"} aria-controls="workspace-navigation" aria-expanded={navigationOpen} onClick={onToggleNavigation}><Icon name="sidebar" /></button>
    <div className="focused-tabstrip" role="tablist" aria-label={spaceLabel ? `Open sessions in ${spaceLabel}` : "Open sessions"}>
    {openAgentIds.map((agentId) => {
      const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
      const title = agent?.name ?? "Detached session";
      const status = agent ? statusText(agent.status) : "Disconnected";
      const visibleTitle = `${title} · ${status}`;
      return <div key={agentId} role="presentation" className={`focused-tab-shell ${agentId === activeAgentId ? "active" : ""}`}>
        <button
          ref={(element) => { if (element) tabRefs.current.set(agentId, element); else tabRefs.current.delete(agentId); }}
          id={`session-tab-${encodeURIComponent(agentId)}`}
          type="button"
          role="tab"
          aria-controls="selected-session-panel"
          aria-selected={agentId === activeAgentId}
          aria-label={`${visibleTitle}${spaceLabel ? ` in ${spaceLabel}` : ""}. Press Delete to close.`}
          title={visibleTitle}
          tabIndex={agentId === activeAgentId ? 0 : -1}
          className="focused-tab"
          onClick={() => onSelect(agentId)}
          onKeyDown={(event) => {
            if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); closeTab(agentId); }
            else moveTabFocus(event, agentId);
          }}
        >
          <span className={`focused-status ${agent?.status ?? "disconnected"}`} aria-hidden="true" />
          <span>{visibleTitle}</span>
        </button>
        <button type="button" tabIndex={-1} aria-hidden="true" className="focused-tab-close" onClick={() => closeTab(agentId)}><Icon name="close" /></button>
      </div>;
    })}
    </div>
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
  if (loading) return <section className="focused-surface empty"><div><h1>Loading workspace…</h1><p>Finding your spaces and Prime Agent sessions.</p></div></section>;
  if (agentId === undefined) return <section className="focused-surface empty"><div><h1>No session open</h1><p>{activeProject ? `Select a session in ${activeProject.label} to open its conversation.` : "Open a folder to add your first space."}</p></div></section>;
  if (!agent) return <section className="focused-surface empty"><div><h1>Session no longer available</h1><p>Ernie can’t find this session in its space. Closing this tab won’t delete saved work.</p></div></section>;
  const project = projectForAgent(snapshot, agent);
  const worktree = snapshot.worktrees.find((candidate) => candidate.id === agent.worktreeId);
  if (agent.id.startsWith("rpc:")) return <LiveSessionChatSurface agent={agent} state={agentState} items={liveItems} onAppendUser={onAppendLiveUser} projectLabel={project?.label ?? "Space"} worktreeLabel={worktree?.label ?? "Worktree"} />;
  return <SessionChatSurface agent={agent} state={agentState} interactive={isCommandableAgent(agent, agentState.sessionId)} projectLabel={project?.label ?? "Space"} worktreeLabel={worktree?.label ?? "Worktree"} />;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
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
  const { workspace, currentAgentId } = useMemo(() => {
    const catalogCommandable = snapshot.agents.find((agent) => isCommandableAgent(agent, agentState.sessionId));
    const rootWorktreeId = snapshot.projects[0]?.worktreeIds[0] ?? snapshot.worktrees[0]?.id;
    const liveAgent: WorkspaceAgent | undefined = !catalogCommandable && rootWorktreeId !== undefined ? {
      id: `rpc:${agentState.sessionId || "current"}`, sessionId: agentState.sessionId, worktreeId: rootWorktreeId,
      name: agentState.sessionName || "New conversation", summary: agentState.detail,
      status: agentState.isStreaming ? "working" : agentState.connection === "ready" ? "idle" : agentState.connection === "failed" ? "failed" : "waiting",
      runtimeKind: "root",
    } : undefined;
    return {
      workspace: liveAgent ? { ...snapshot, agents: [liveAgent, ...snapshot.agents] } : snapshot,
      currentAgentId: catalogCommandable?.id ?? liveAgent?.id,
    };
  }, [agentState.connection, agentState.detail, agentState.isStreaming, agentState.sessionId, agentState.sessionName, snapshot]);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(snapshot.projects[0]?.id);
  const [spaceTabs, setSpaceTabs] = useState(emptySpaceSessionTabs);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | undefined>();
  const compactNavigation = useMediaQuery("(max-width: 700px)");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  const emptySessionFocusRef = useRef<HTMLElement>(null);
  const initialized = useRef(false);
  const closeNavigation = () => setNavigationOpen(false);
  const activeSpaceTabs = tabsForSpace(spaceTabs, activeProjectId);
  const openAgentIds = activeSpaceTabs.agentIds;
  const activeAgentId = activeSpaceTabs.activeAgentId;

  useEffect(() => { if (!compactNavigation) setNavigationOpen(false); }, [compactNavigation]);
  useLayoutEffect(() => {
    if (!compactNavigation || navigationOpen) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest("#workspace-navigation")) navigationToggleRef.current?.focus();
  }, [compactNavigation, navigationOpen]);
  useEffect(() => {
    if (!compactNavigation || !navigationOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") closeNavigation(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [compactNavigation, navigationOpen]);

  useEffect(() => {
    if (initialized.current || workspace.agents.length === 0) return;
    initialized.current = true;
    const initial = workspace.agents.find((agent) => agent.id === currentAgentId) ?? workspace.agents.find((agent) => agent.status === "working") ?? workspace.agents[0];
    if (!initial) return;
    const projectId = projectForAgent(workspace, initial)?.id;
    if (!projectId) return;
    setSpaceTabs((state) => openSpaceSessionTab(state, projectId, initial.id));
    setActiveProjectId(projectId);
  }, [currentAgentId, workspace]);

  useEffect(() => {
    if (!currentAgentId) return;
    setSpaceTabs((state) => reconcileProvisionalSessionTabs(state, currentAgentId));
  }, [currentAgentId]);

  useEffect(() => {
    if (activeProjectId !== undefined && snapshot.projects.some((project) => project.id === activeProjectId)) return;
    setActiveProjectId(snapshot.projects[0]?.id);
  }, [activeProjectId, snapshot.projects]);

  const activeProject = workspace.projects.find((project) => project.id === activeProjectId);
  const selectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    if (compactNavigation) closeNavigation();
  };
  const openAgent = (agent: WorkspaceAgent) => {
    const projectId = projectForAgent(workspace, agent)?.id;
    if (!projectId) return;
    setSpaceTabs((state) => openSpaceSessionTab(state, projectId, agent.id));
    setActiveProjectId(projectId);
    if (compactNavigation) closeNavigation();
  };
  const selectAgent = (agentId: string) => {
    if (!activeProjectId) return;
    setSpaceTabs((state) => selectSpaceSessionTab(state, activeProjectId, agentId));
  };
  const closeAgent = (agentId: string) => {
    if (!activeProjectId) return;
    setSpaceTabs((state) => closeSpaceSessionTab(state, activeProjectId, agentId));
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
    <WorkspaceSidebar snapshot={workspace} activeProjectId={activeProjectId} activeAgentId={activeAgentId} loading={loading} failed={failed} opening={opening} openError={openError} compact={compactNavigation} open={!compactNavigation || navigationOpen} onClose={closeNavigation} onSelectProject={selectProject} onOpenAgent={openAgent} onOpenDirectory={() => { void openDirectory(); }} />
    {compactNavigation && navigationOpen && <button type="button" tabIndex={-1} aria-hidden="true" className="workspace-navigation-scrim" onClick={closeNavigation} />}
    <section className="focused-main-column" aria-hidden={compactNavigation && navigationOpen} inert={compactNavigation && navigationOpen ? true : undefined}>
      <div className="focused-titlebar-drag" aria-hidden="true" />
      <SessionTabs snapshot={workspace} spaceLabel={activeProject?.label} openAgentIds={openAgentIds} activeAgentId={activeAgentId} navigationOpen={navigationOpen} navigationToggleRef={navigationToggleRef} emptyFocusRef={emptySessionFocusRef} onToggleNavigation={() => setNavigationOpen((current) => !current)} onSelect={selectAgent} onClose={closeAgent} />
      <section ref={emptySessionFocusRef} tabIndex={-1} id="selected-session-panel" className="selected-session-panel" role="tabpanel" aria-labelledby={activeAgentId ? `session-tab-${encodeURIComponent(activeAgentId)}` : undefined} aria-label={activeAgentId ? undefined : "Session workspace"}>
        <SessionSurface snapshot={workspace} agentId={activeAgentId} loading={loading} activeProject={activeProject} agentState={agentState} liveItems={liveItems} onAppendLiveUser={onAppendLiveUser} />
      </section>
    </section>
  </div>;
}
