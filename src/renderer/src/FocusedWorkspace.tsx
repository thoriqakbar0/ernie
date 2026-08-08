import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import type { AgentState } from "../../shared/contract";
import type { AgentModelOption, SpaceRuntimeState } from "../../shared/spaceRuntime";
import type { WorkspaceAgent, WorkspaceProject, WorkspaceSnapshot, WorkspaceWorktree } from "../../shared/workspace";
import { flattenAgentHierarchy } from "./ProjectSidebar";
import { LiveSessionChatSurface, SessionChatSurface } from "./SessionChatSurface";
import { SpaceLaunchpad } from "./SpaceLaunchpad";
import { readSpaceLaunchPreference, writeSpaceLaunchPreference, type SpaceLaunchPreference } from "./spaceLaunchPreferences";
import type { ThreadItem } from "./transcript";
import { prioritizeRootAgents } from "./agentPriority";
import {
  closeSpaceSessionTab,
  emptySpaceSessionTabs,
  openSpaceSessionTab,
  reconcileProvisionalSessionTab,
  selectSpaceSessionTab,
  tabsForSpace,
} from "./spaceSessionTabs";

type IconName = "chevron" | "close" | "folder-add" | "sidebar" | "subagent-fork" | "subagent-network" | "subagent-waypoints" | "subagent-workflow";

const ICON_PATHS: Record<IconName, ReactNode> = {
  chevron: <path d="m9 18 6-6-6-6" />,
  close: <path d="m6 6 8 8m0-8-8 8" />,
  "folder-add": <path d="M12 10v6m-3-3h6m5 7a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  sidebar: <><rect x="2.5" y="2.5" width="15" height="15" rx="2" /><path d="M7.5 2.5v15m4-10 3 2.5-3 2.5" /></>,
  "subagent-fork": <><circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><path d="M18 9v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9m6 3v3" /></>,
  "subagent-network": <><rect width="6" height="6" x="16" y="16" rx="1" /><rect width="6" height="6" x="2" y="16" rx="1" /><rect width="6" height="6" x="9" y="2" rx="1" /><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3m-7-4V8" /></>,
  "subagent-waypoints": <><path d="m10.6 5.4-5.2 5.2m13.2 2.8-5.2 5.2M6 12h12" /><circle cx="12" cy="20" r="2" /><circle cx="12" cy="4" r="2" /><circle cx="20" cy="12" r="2" /><circle cx="4" cy="12" r="2" /></>,
  "subagent-workflow": <><rect width="8" height="8" x="3" y="3" rx="2" /><path d="M7 11v4a2 2 0 0 0 2 2h4" /><rect width="8" height="8" x="13" y="13" rx="2" /></>,
};

function Icon({ name }: { readonly name: IconName }) {
  const usesLucideGrid = name !== "close" && name !== "sidebar";
  return <svg viewBox={usesLucideGrid ? "0 0 24 24" : "0 0 20 20"} aria-hidden="true">{ICON_PATHS[name]}</svg>;
}

const SUBAGENT_ICONS = ["subagent-fork", "subagent-workflow", "subagent-network", "subagent-waypoints"] as const;

function SubagentMark({ agentId, depth }: { readonly agentId: string; readonly depth: number }) {
  let hash = 0;
  for (const character of agentId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const icon = SUBAGENT_ICONS[hash % SUBAGENT_ICONS.length] ?? "subagent-fork";
  return <span className="focused-session-kind" title={`Subagent, depth ${depth}`}><Icon name={icon} /><span className="focused-session-depth" aria-hidden="true">{depth}</span></span>;
}

function projectForAgent(snapshot: WorkspaceSnapshot, agent: WorkspaceAgent): WorkspaceProject | undefined {
  return snapshot.projects.find((project) => project.worktreeIds.includes(agent.worktreeId));
}

function isCommandableAgent(agent: WorkspaceAgent, sessionId: string): boolean {
  return sessionId.length > 0
    && (agent.sessionId === sessionId || agent.id === sessionId || agent.activeSessionId === sessionId);
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

function SessionRow({ agent, active, context, depth = 0, onOpen }: {
  readonly agent: WorkspaceAgent;
  readonly active: boolean;
  readonly context: string;
  readonly depth?: number;
  readonly onOpen: (agent: WorkspaceAgent) => void;
}) {
  const status = statusText(agent.status);
  const isSubagent = agent.runtimeKind === "subagent";
  const subagentDepth = isSubagent ? Math.max(1, depth) : 0;
  const fullLabel = [agent.name, isSubagent ? `Subagent, depth ${subagentDepth}` : undefined, status, context].filter(Boolean).join(" — ");
  return <button
    type="button"
    className={`focused-session-row ${isSubagent ? "subagent" : "root-agent"} ${active ? "active" : ""}`}
    aria-current={active ? "page" : undefined}
    aria-label={fullLabel}
    title={fullLabel}
    onClick={() => onOpen(agent)}
  >
    <span className="focused-session-copy">
      <span className="focused-session-title"><strong>{agent.name}</strong>{isSubagent && <SubagentMark agentId={agent.id} depth={subagentDepth} />}</span>
      <small className="focused-session-meta"><span>{status}</span><span>{context}</span></small>
    </span>
  </button>;
}

function SpaceRow({ project, worktrees, active, hasWorkingAgent, onSelect }: {
  readonly project: WorkspaceProject;
  readonly worktrees: readonly WorkspaceWorktree[];
  readonly active: boolean;
  readonly hasWorkingAgent: boolean;
  readonly onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const worktreeListId = useId();
  const worktreeContext = worktrees.length === 1
    ? worktrees[0]?.label ?? "Local directory"
    : `${worktrees.length} worktrees`;
  const label = `${project.label}, ${worktreeContext}${hasWorkingAgent ? ", working" : ""}`;
  return <li className="workspace-project-node">
    <div className={`workspace-project-control ${active ? "active" : ""}`}>
      <button type="button" className="workspace-project-row" aria-current={active ? "page" : undefined} aria-label={label} title={project.path} onClick={onSelect}>
        <span className={`workspace-project-mark ${hasWorkingAgent ? "working" : ""}`} aria-hidden="true" />
        <strong>{project.label}</strong>
        <small>{worktreeContext}</small>
      </button>
      {worktrees.length > 0 && <button
        type="button"
        className={`workspace-project-disclosure ${expanded ? "expanded" : ""}`}
        aria-expanded={expanded}
        aria-controls={worktreeListId}
        aria-label={`${expanded ? "Hide" : "Show"} worktrees for ${project.label}`}
        title={`${expanded ? "Hide" : "Show"} worktrees`}
        onClick={() => setExpanded((current) => !current)}
      ><Icon name="chevron" /></button>}
    </div>
    {expanded && worktrees.length > 0 && <ul id={worktreeListId} className="workspace-worktree-list" aria-label={`Worktrees for ${project.label}`}>
      {worktrees.map((worktree) => <li key={worktree.id} className="workspace-worktree-row" title={worktree.path}>
        <strong>{worktree.label}</strong>
        <small>{worktree.path}</small>
      </li>)}
    </ul>}
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
  readonly depth: number;
  readonly children: AgentTreeNode[];
}

function agentTree(agents: readonly WorkspaceAgent[], contextForAgent: (agent: WorkspaceAgent) => string): readonly AgentTreeNode[] {
  const roots: AgentTreeNode[] = [];
  const stack: AgentTreeNode[] = [];
  for (const { agent, depth } of flattenAgentHierarchy(agents)) {
    const node: AgentTreeNode = { agent, context: contextForAgent(agent), depth, children: [] };
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
    <SessionRow agent={node.agent} context={node.context} depth={node.depth} active={node.agent.id === activeAgentId} onOpen={onOpenAgent} />
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
    const agents = prioritizeRootAgents(snapshot.agents);
    if (agents.length === 0) return <p className="focused-message">Nothing needs attention right now.</p>;
    return <ul className="workspace-agent-list">{agents.map((agent) => <li key={agent.id}>
      <SessionRow agent={agent} context={agentContext(snapshot, agent)} depth={0} active={agent.id === activeAgentId} onOpen={onOpenAgent} />
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
  const priorityCount = prioritizeRootAgents(snapshot.agents).length;
  const workingWorktreeIds = new Set<string>();
  for (const agent of snapshot.agents) if (agent.status === "working") workingWorktreeIds.add(agent.worktreeId);
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
            const hasWorkingAgent = project.worktreeIds.some((worktreeId) => workingWorktreeIds.has(worktreeId));
            return <SpaceRow key={project.id} project={project} worktrees={worktrees} active={project.id === activeProjectId} hasWorkingAgent={hasWorkingAgent} onSelect={() => onSelectProject(project.id)} />;
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

function modelKey(model: { readonly provider: string; readonly id: string }): string {
  return JSON.stringify([model.provider, model.id]);
}

function preferenceWithModel(preference: SpaceLaunchPreference, model: AgentModelOption | undefined): SpaceLaunchPreference {
  return model
    ? { modelProvider: model.provider, modelId: model.id, rlmMaxDepth: preference.rlmMaxDepth }
    : { rlmMaxDepth: preference.rlmMaxDepth };
}

function SpaceLaunchpadContainer({ project, worktreeLabel, onRuntimeState, onStarted }: {
  readonly project: WorkspaceProject;
  readonly worktreeLabel: string;
  readonly onRuntimeState: (state: SpaceRuntimeState) => void;
  readonly onStarted: (agentId: string, prompt: string) => void;
}) {
  const [preference, setPreference] = useState(() => readSpaceLaunchPreference(window.localStorage, project.id));
  const initialPreference = useRef(preference).current;
  const [models, setModels] = useState<readonly AgentModelOption[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [retrySequence, setRetrySequence] = useState(0);
  const [promptDraft, setPromptDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setModelsLoading(true);
    setModelsError(null);
    void window.ernie.getSpaceModels(project.id).then(async (available) => {
      if (!active) return;
      if (available.length === 0) {
        setModels([]);
        setModelsError("Models are unavailable. Retry to choose a model and start a thread.");
        return;
      }
      const runtime = await window.ernie.getSpaceState(project.id);
      if (!active) return;
      onRuntimeState(runtime);
      setModels(available);
      const preferred = available.find((model) => model.provider === initialPreference.modelProvider && model.id === initialPreference.modelId);
      const current = available.find((model) => model.provider === runtime.agent.provider && model.id === runtime.agent.modelId);
      const selected = preferred ?? current ?? available[0];
      if (selected) setSelectedModelKey(modelKey(selected));
    }).catch(() => {
      if (active) setModelsError("Models are unavailable. Retry to choose a model and start a thread.");
    }).finally(() => { if (active) setModelsLoading(false); });
    return () => { active = false; };
  }, [initialPreference.modelId, initialPreference.modelProvider, onRuntimeState, project.id, retrySequence]);

  const persist = (next: SpaceLaunchPreference) => {
    setPreference(next);
    writeSpaceLaunchPreference(window.localStorage, project.id, next);
  };
  const selectModel = (key: string) => {
    setSelectedModelKey(key);
    const selected = models.find((model) => modelKey(model) === key);
    if (selected) persist(preferenceWithModel(preference, selected));
  };
  const selectDepth = (rlmMaxDepth: number) => {
    const selected = models.find((model) => modelKey(model) === selectedModelKey);
    persist({ ...preferenceWithModel(preference, selected), rlmMaxDepth });
  };
  const start = async ({ prompt, modelId, rlmMaxDepth }: { readonly prompt: string; readonly modelId: string; readonly rlmMaxDepth: number }) => {
    const selected = models.find((model) => modelKey(model) === modelId);
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.ernie.startSpace({
        spaceId: project.id,
        prompt,
        model: { provider: selected.provider, id: selected.id },
        rlmMaxDepth,
      });
      if (!result.ok) {
        setError(result.error ?? "Prime Agent is unavailable. Review the recovery details, then try again.");
        return;
      }
      persist({ modelProvider: selected.provider, modelId: selected.id, rlmMaxDepth });
      try { onRuntimeState(await window.ernie.getSpaceState(project.id)); } catch { /* A live state event remains authoritative. */ }
      onStarted(`rpc:${project.id}`, prompt);
    } catch {
      setError("Prime Agent is unavailable. Review the recovery details, then try again.");
    } finally {
      setBusy(false);
    }
  };

  return <SpaceLaunchpad
    spaceLabel={project.label}
    worktreeLabel={worktreeLabel}
    models={models.map((model) => ({ id: modelKey(model), label: model.label, provider: model.provider }))}
    selectedModelId={selectedModelKey}
    modelsLoading={modelsLoading}
    modelsError={modelsError}
    onModelChange={selectModel}
    onRetryModels={() => setRetrySequence((sequence) => sequence + 1)}
    rlmMaxDepth={preference.rlmMaxDepth}
    onRlmMaxDepthChange={selectDepth}
    promptDraft={promptDraft}
    onPromptDraftChange={setPromptDraft}
    busy={busy}
    error={error}
    onSubmit={(payload) => { void start(payload); }}
  />;
}

function SessionSurface({ snapshot, agentId, loading, activeProject, runtimeState, liveItems, onAppendLiveUser, onRuntimeState, onStarted }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly agentId: string | undefined;
  readonly loading: boolean;
  readonly activeProject: WorkspaceProject | undefined;
  readonly runtimeState: SpaceRuntimeState | undefined;
  readonly liveItems: readonly ThreadItem[];
  readonly onAppendLiveUser: (spaceId: string, text: string) => void;
  readonly onRuntimeState: (state: SpaceRuntimeState) => void;
  readonly onStarted: (agentId: string, prompt: string) => void;
}) {
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  if (loading) return <section className="focused-surface empty"><div><h1>Loading workspace…</h1><p>Finding your spaces and Prime Agent sessions.</p></div></section>;
  if (agentId === undefined && activeProject) {
    const worktreeIds = new Set(activeProject.worktreeIds);
    const worktree = snapshot.worktrees.find((candidate) => worktreeIds.has(candidate.id));
    return <SpaceLaunchpadContainer
      key={activeProject.id}
      project={activeProject}
      worktreeLabel={worktree?.label ?? "Local directory"}
      onRuntimeState={onRuntimeState}
      onStarted={onStarted}
    />;
  }
  if (agentId === undefined) return <section className="focused-surface empty"><div><h1>No spaces yet</h1><p>Open a folder to add your first space.</p></div></section>;
  if (!agent) return <section className="focused-surface empty"><div><h1>Session no longer available</h1><p>Ernie can’t find this session in its space. Closing this tab won’t delete saved work.</p></div></section>;
  const project = projectForAgent(snapshot, agent);
  const worktree = snapshot.worktrees.find((candidate) => candidate.id === agent.worktreeId);
  const state = runtimeState?.agent;
  if (agent.id.startsWith("rpc:") && state) return <LiveSessionChatSurface agent={agent} state={state} items={liveItems} onAppendUser={(text) => onAppendLiveUser(project?.id ?? activeProject?.id ?? "", text)} spaceId={project?.id ?? activeProject?.id ?? ""} projectLabel={project?.label ?? "Space"} worktreeLabel={worktree?.label ?? "Worktree"} />;
  const interactive = state !== undefined && isCommandableAgent(agent, state.sessionId);
  return <SessionChatSurface agent={agent} state={state} interactive={interactive} spaceId={project?.id} projectLabel={project?.label ?? "Space"} worktreeLabel={worktree?.label ?? "Worktree"} />;
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

export function FocusedWorkspace({ snapshot, runtimeStates, liveItemsBySpace, onAppendLiveUser, onRuntimeState, failed, loading, onSnapshot }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly runtimeStates: ReadonlyMap<string, SpaceRuntimeState>;
  readonly liveItemsBySpace: ReadonlyMap<string, readonly ThreadItem[]>;
  readonly onAppendLiveUser: (spaceId: string, text: string) => void;
  readonly onRuntimeState: (state: SpaceRuntimeState) => void;
  readonly failed: boolean;
  readonly loading: boolean;
  readonly onSnapshot: (snapshot: WorkspaceSnapshot) => void;
}) {
  const { workspace, currentAgentBySpace } = useMemo(() => {
    const current = new Map<string, string>();
    const liveAgents: WorkspaceAgent[] = [];
    for (const project of snapshot.projects) {
      const runtime = runtimeStates.get(project.id);
      if (!runtime) continue;
      const catalogAgent = snapshot.agents.find((agent) => project.worktreeIds.includes(agent.worktreeId) && isCommandableAgent(agent, runtime.agent.sessionId));
      if (catalogAgent) {
        current.set(project.id, catalogAgent.id);
        continue;
      }
      if (runtime.agent.messageCount === 0 && !runtime.agent.isStreaming) continue;
      const worktreeId = project.worktreeIds[0];
      if (!worktreeId) continue;
      const liveAgent: WorkspaceAgent = {
        id: `rpc:${project.id}`,
        sessionId: runtime.agent.sessionId,
        worktreeId,
        name: runtime.agent.sessionName || "New conversation",
        summary: runtime.agent.detail,
        status: runtime.agent.isStreaming ? "working" : runtime.agent.connection === "ready" ? "idle" : runtime.agent.connection === "failed" ? "failed" : "waiting",
        runtimeKind: "root",
      };
      liveAgents.push(liveAgent);
      current.set(project.id, liveAgent.id);
    }
    return {
      workspace: liveAgents.length > 0 ? { ...snapshot, agents: [...liveAgents, ...snapshot.agents] } : snapshot,
      currentAgentBySpace: current,
    };
  }, [runtimeStates, snapshot]);
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
    const currentIds = new Set(currentAgentBySpace.values());
    const initial = workspace.agents.find((agent) => currentIds.has(agent.id))
      ?? workspace.agents.find((agent) => agent.status === "working")
      ?? workspace.agents[0];
    if (!initial) return;
    const projectId = projectForAgent(workspace, initial)?.id;
    if (!projectId) return;
    setSpaceTabs((state) => openSpaceSessionTab(state, projectId, initial.id));
    setActiveProjectId(projectId);
  }, [currentAgentBySpace, workspace]);

  useEffect(() => {
    setSpaceTabs((state) => {
      let next = state;
      for (const [spaceId, agentId] of currentAgentBySpace) {
        if (!agentId.startsWith("rpc:")) next = reconcileProvisionalSessionTab(next, spaceId, agentId);
      }
      return next;
    });
  }, [currentAgentBySpace]);

  useEffect(() => {
    if (activeProjectId !== undefined && snapshot.projects.some((project) => project.id === activeProjectId)) return;
    setActiveProjectId(snapshot.projects[0]?.id);
  }, [activeProjectId, snapshot.projects]);
  useEffect(() => {
    if (!activeProjectId || runtimeStates.has(activeProjectId)) return;
    let active = true;
    void window.ernie.getSpaceState(activeProjectId).then((state) => { if (active) onRuntimeState(state); }).catch(() => {});
    return () => { active = false; };
  }, [activeProjectId, onRuntimeState, runtimeStates]);

  const activeProject = workspace.projects.find((project) => project.id === activeProjectId);
  const runtimeState = activeProjectId ? runtimeStates.get(activeProjectId) : undefined;
  const liveItems = activeProjectId ? liveItemsBySpace.get(activeProjectId) ?? [] : [];
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
  const started = (agentId: string, prompt: string) => {
    if (!activeProjectId) return;
    setSpaceTabs((state) => openSpaceSessionTab(state, activeProjectId, agentId));
    onAppendLiveUser(activeProjectId, prompt);
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
        <SessionSurface snapshot={workspace} agentId={activeAgentId} loading={loading} activeProject={activeProject} runtimeState={runtimeState} liveItems={liveItems} onAppendLiveUser={onAppendLiveUser} onRuntimeState={onRuntimeState} onStarted={started} />
      </section>
    </section>
  </div>;
}
