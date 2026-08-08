import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import type { AgentState } from "../../shared/contract";
import type { WorkspaceAgent, WorkspaceProject, WorkspaceSnapshot, WorkspaceWorktree } from "../../shared/workspace";
import { flattenAgentHierarchy } from "./ProjectSidebar";
import { LiveSessionChatSurface, SessionChatSurface } from "./SessionChatSurface";
import type { ThreadItem } from "./transcript";
import { prioritizeAgents } from "./agentPriority";

type IconName = "agents" | "branch" | "close" | "folder-add" | "sidebar" | "spaces";

const ICON_PATHS: Record<IconName, ReactNode> = {
  agents: <><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2m16 0h2m-7-1v2m-6-2v2" /></>,
  branch: <><circle cx="6" cy="5" r="1.5" /><circle cx="14" cy="15" r="1.5" /><path d="M6 6.5v3.7a4.8 4.8 0 0 0 4.8 4.8h1.7M14 13.5V5" /></>,
  close: <path d="m6 6 8 8m0-8-8 8" />,
  "folder-add": <path d="M12 10v6m-3-3h6m5 7a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  sidebar: <><rect x="2.5" y="2.5" width="15" height="15" rx="2" /><path d="M7.5 2.5v15m4-10 3 2.5-3 2.5" /></>,
  spaces: <><path d="M20 5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2.5a1.5 1.5 0 0 1 1.2.6l.6.8a1.5 1.5 0 0 0 1.2.6z" /><path d="M3 8.27a2 2 0 0 0-1 1.74V19a2 2 0 0 0 2 2h11a2 2 0 0 0 1.73-1" /></>,
};

function Icon({ name }: { readonly name: IconName }) {
  const usesLucideGrid = name === "agents" || name === "folder-add" || name === "spaces";
  return <svg viewBox={usesLucideGrid ? "0 0 24 24" : "0 0 20 20"} aria-hidden="true">{ICON_PATHS[name]}</svg>;
}

function projectForAgent(snapshot: WorkspaceSnapshot, agent: WorkspaceAgent): WorkspaceProject | undefined {
  return snapshot.projects.find((project) => project.worktreeIds.includes(agent.worktreeId));
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
  const fullLabel = `${agent.name} — ${context}`;
  return <button
    type="button"
    className={`focused-session-row ${active ? "active" : ""}`}
    aria-current={active ? "page" : undefined}
    aria-label={fullLabel}
    title={fullLabel}
    onClick={() => onOpen(agent)}
  >
    <span className={`focused-status ${agent.status}`} aria-hidden="true" />
    <span className="focused-session-copy"><strong>{agent.name}</strong><small>{context}</small></span>
    {agent.status === "working" && <ActivityBar />}
  </button>;
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
      <span className={`focused-chevron ${expanded ? "expanded" : ""}`} aria-hidden="true">›</span>
      <span className={`workspace-project-mark ${hasWorkingSession ? "working" : ""}`} aria-hidden="true" />
      <strong>{project.label}</strong>
      <small>{worktrees.length}{hasWorkingSession ? " · Working" : ""}</small>
    </button>
    {expanded && <ul className="workspace-worktree-list">{worktrees.map((worktree) => <li key={worktree.id}><Icon name="branch" /><span>{worktree.label}</span></li>)}</ul>}
  </li>;
}

type AgentView = "agents" | "priority";
type SidebarView = "spaces" | "agents";

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

function WorkspaceModeTabs({ value, onChange }: {
  readonly value: SidebarView;
  readonly onChange: (view: SidebarView) => void;
}) {
  const spacesRef = useRef<HTMLButtonElement>(null);
  const agentsRef = useRef<HTMLButtonElement>(null);
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = horizontalTabStep(event);
    const next = event.key === "Home" ? "spaces"
      : event.key === "End" ? "agents"
      : step !== undefined ? value === "spaces" ? "agents" : "spaces"
      : undefined;
    if (!next) return;
    event.preventDefault();
    onChange(next);
    (next === "spaces" ? spacesRef : agentsRef).current?.focus();
  };
  return <div className="workspace-sidebar-tabs" role="tablist" aria-label="Workspace views" data-active={value}>
    <button ref={spacesRef} id="spaces-tab" type="button" role="tab" aria-controls="spaces-panel" aria-selected={value === "spaces"} tabIndex={value === "spaces" ? 0 : -1} onClick={() => onChange("spaces")} onKeyDown={moveFocus}><Icon name="spaces" /><span>Spaces</span></button>
    <button ref={agentsRef} id="agents-tab" type="button" role="tab" aria-controls="agents-panel" aria-selected={value === "agents"} tabIndex={value === "agents" ? 0 : -1} onClick={() => onChange("agents")} onKeyDown={moveFocus}><Icon name="agents" /><span>Agents</span></button>
  </div>;
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
    <button ref={allRef} id="all-agents-tab" type="button" role="tab" aria-controls="agent-list-panel" aria-selected={value === "agents"} className={value === "agents" ? "active" : ""} tabIndex={value === "agents" ? 0 : -1} onClick={() => onChange("agents")} onKeyDown={moveFocus}>All agents</button>
    <button ref={priorityRef} id="priority-tab" type="button" role="tab" aria-controls="agent-list-panel" aria-selected={value === "priority"} aria-label={`Priority, ${priorityCount} agents`} className={value === "priority" ? "active" : ""} tabIndex={value === "priority" ? 0 : -1} onClick={() => onChange("priority")} onKeyDown={moveFocus}>Priority <span aria-hidden="true">{priorityCount}</span></button>
  </div>;
}

function OpenFolderAction({ opening, onOpen }: {
  readonly opening: boolean;
  readonly onOpen: () => void;
}) {
  return <button type="button" disabled={opening} onClick={onOpen}>
    <span className="workspace-folder-action-icon"><Icon name="folder-add" /></span>
    <span className="workspace-folder-action-copy"><strong>{opening ? "Opening folder…" : "Open folder"}</strong><small>Add a local space</small></span>
  </button>;
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

function agentTree(agents: readonly WorkspaceAgent[], context: string): readonly AgentTreeNode[] {
  const roots: AgentTreeNode[] = [];
  const stack: AgentTreeNode[] = [];
  for (const { agent, depth } of flattenAgentHierarchy(agents)) {
    const node: AgentTreeNode = { agent, context, children: [] };
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
    <SessionRow agent={node.agent} context={`${statusText(node.agent.status)} · ${node.context}`} active={node.agent.id === activeAgentId} onOpen={onOpenAgent} />
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
      <SessionRow agent={agent} context={`${statusText(agent.status)} · ${agentContext(snapshot, agent)}`} active={agent.id === activeAgentId} onOpen={onOpenAgent} />
    </li>)}</ul>;
  }
  const trees = snapshot.projects.flatMap((project) => project.worktreeIds.flatMap((worktreeId) => {
    const worktree = snapshot.worktrees.find((candidate) => candidate.id === worktreeId);
    return worktree ? agentTree(snapshot.agents.filter((agent) => agent.worktreeId === worktreeId), `${project.label} · ${worktree.label}`) : [];
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
  const [sidebarView, setSidebarView] = useState<SidebarView>("agents");
  const [agentView, setAgentView] = useState<AgentView>("agents");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!compact || !open) return;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [compact, open]);
  const activeProject = snapshot.projects.find((project) => project.id === activeProjectId);
  const priorityCount = prioritizeAgents(snapshot.agents).length;
  const showFooter = sidebarView !== "spaces" || loading || snapshot.projects.length > 0;
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
    data-footer={showFooter}
    onKeyDown={compact && open ? trapDrawerFocus : undefined}
  >
    <header className="workspace-sidebar-title">
      <strong id="workspace-navigation-title">Ernie Dev</strong><span>{activeProject?.path ?? "Local agent workspace"}</span>
      <button ref={closeButtonRef} type="button" className="workspace-sidebar-close" aria-label="Close workspace navigation" onClick={onClose}><Icon name="close" /></button>
    </header>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">Workspace status: {loading ? "Loading spaces" : failed ? "Spaces unavailable; retrying automatically" : "Spaces available"}</div>
    {sidebarView === "agents" && openError && <div className="sr-only" role="alert">{openError}</div>}
    <WorkspaceModeTabs value={sidebarView} onChange={setSidebarView} />
    {sidebarView === "spaces" ? <section id="spaces-panel" className="workspace-projects" role="tabpanel" aria-labelledby="spaces-tab">
      <div className="workspace-project-scroll">
        {failed && <p className="focused-message error" role="alert">Spaces are temporarily unavailable. Ernie will retry automatically.</p>}
        {openError && <p className="focused-message error" role="alert">{openError}</p>}
        {loading && snapshot.projects.length === 0 && <p className="focused-message" role="status">Loading spaces…</p>}
        {!loading && snapshot.projects.length === 0 && <FirstSpacePrompt opening={opening} onOpen={onOpenDirectory} />}
        <ul className="workspace-project-list">{snapshot.projects.map((project) => {
          const worktrees = project.worktreeIds.flatMap((id) => snapshot.worktrees.find((worktree) => worktree.id === id) ?? []);
          const hasWorkingSession = snapshot.agents.some((agent) => worktrees.some((worktree) => worktree.id === agent.worktreeId) && agent.status === "working");
          return <ProjectNode key={project.id} project={project} worktrees={worktrees} active={project.id === activeProjectId} hasWorkingSession={hasWorkingSession} onSelect={() => onSelectProject(project.id)} />;
        })}</ul>
      </div>
    </section> : <section id="agents-panel" className="workspace-sessions" role="tabpanel" aria-labelledby="agents-tab">
      <AgentViewTabs value={agentView} priorityCount={priorityCount} onChange={setAgentView} />
      <div id="agent-list-panel" className="workspace-session-scroll" role="tabpanel" aria-labelledby={agentView === "agents" ? "all-agents-tab" : "priority-tab"}><AgentPane snapshot={snapshot} view={agentView} activeAgentId={activeAgentId} onOpenAgent={onOpenAgent} /></div>
    </section>}
    {showFooter && <footer className="workspace-sidebar-footer"><OpenFolderAction opening={opening} onOpen={onOpenDirectory} /></footer>}
  </aside>;
}

function SessionTabs({ snapshot, openAgentIds, activeAgentId, navigationOpen, navigationToggleRef, emptyFocusRef, onToggleNavigation, onSelect, onClose }: {
  readonly snapshot: WorkspaceSnapshot;
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
    <div className="focused-tabstrip" role="tablist" aria-label="Open sessions">
    {openAgentIds.map((agentId) => {
      const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
      const project = agent ? projectForAgent(snapshot, agent) : undefined;
      const title = agent?.name ?? "Detached session";
      const status = agent ? statusText(agent.status) : "Disconnected";
      const visibleTitle = `${title}${project ? ` · ${project.label}` : ""} · ${status}`;
      return <div key={agentId} role="presentation" className={`focused-tab-shell ${agentId === activeAgentId ? "active" : ""}`}>
        <button
          ref={(element) => { if (element) tabRefs.current.set(agentId, element); else tabRefs.current.delete(agentId); }}
          id={`session-tab-${encodeURIComponent(agentId)}`}
          type="button"
          role="tab"
          aria-controls="selected-session-panel"
          aria-selected={agentId === activeAgentId}
          aria-label={`${visibleTitle}. Press Delete to close.`}
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
  const [openAgentIds, setOpenAgentIds] = useState<readonly string[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | undefined>();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | undefined>();
  const compactNavigation = useMediaQuery("(max-width: 700px)");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  const emptySessionFocusRef = useRef<HTMLElement>(null);
  const initialized = useRef(false);
  const closeNavigation = () => setNavigationOpen(false);

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
    setOpenAgentIds([initial.id]); setActiveAgentId(initial.id); setActiveProjectId(projectForAgent(workspace, initial)?.id);
  }, [currentAgentId, workspace]);

  useEffect(() => {
    if (!currentAgentId) return;
    setOpenAgentIds((ids) => {
      const unique = new Set<string>();
      for (const id of ids) unique.add(id.startsWith("rpc:") ? currentAgentId : id);
      return [...unique];
    });
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
    if (compactNavigation) closeNavigation();
  };
  const closeAgent = (agentId: string) => {
    const index = openAgentIds.indexOf(agentId);
    const next = openAgentIds.filter((id) => id !== agentId);
    setOpenAgentIds(next);
    if (agentId === activeAgentId) setActiveAgentId(next[Math.min(index, next.length - 1)] ?? next[0]);
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
    <WorkspaceSidebar snapshot={workspace} activeProjectId={activeProjectId} activeAgentId={activeAgentId} loading={loading} failed={failed} opening={opening} openError={openError} compact={compactNavigation} open={!compactNavigation || navigationOpen} onClose={closeNavigation} onSelectProject={setActiveProjectId} onOpenAgent={openAgent} onOpenDirectory={() => { void openDirectory(); }} />
    {compactNavigation && navigationOpen && <button type="button" tabIndex={-1} aria-hidden="true" className="workspace-navigation-scrim" onClick={closeNavigation} />}
    <section className="focused-main-column" aria-hidden={compactNavigation && navigationOpen} inert={compactNavigation && navigationOpen ? true : undefined}>
      <div className="focused-titlebar-drag" aria-hidden="true" />
      <SessionTabs snapshot={workspace} openAgentIds={openAgentIds} activeAgentId={activeAgentId} navigationOpen={navigationOpen} navigationToggleRef={navigationToggleRef} emptyFocusRef={emptySessionFocusRef} onToggleNavigation={() => setNavigationOpen((current) => !current)} onSelect={setActiveAgentId} onClose={closeAgent} />
      <section ref={emptySessionFocusRef} tabIndex={-1} id="selected-session-panel" className="selected-session-panel" role="tabpanel" aria-labelledby={activeAgentId ? `session-tab-${encodeURIComponent(activeAgentId)}` : undefined} aria-label={activeAgentId ? undefined : "Session workspace"}>
        <SessionSurface snapshot={workspace} agentId={activeAgentId} loading={loading} activeProject={activeProject} agentState={agentState} liveItems={liveItems} onAppendLiveUser={onAppendLiveUser} />
      </section>
    </section>
  </div>;
}
