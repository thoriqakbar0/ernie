import { useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { WorkspaceAgent, WorkspaceProject, WorkspaceSnapshot, WorkspaceWorktree } from "../../shared/workspace";
import { prioritizeRootAgents } from "./agentPriority";
import { horizontalTabStep } from "./tabKeyboardNavigation";
import { flattenAgentHierarchy } from "./ProjectSidebar";
import { Icon } from "./WorkspaceIcon";
import { projectForAgent, statusText } from "./workspaceAgentPresentation";

const SUBAGENT_ICONS = ["subagent-fork", "subagent-workflow", "subagent-network", "subagent-waypoints"] as const;

function SubagentMark({ agentId, depth }: { readonly agentId: string; readonly depth: number }) {
  let hash = 0;
  for (const character of agentId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const icon = SUBAGENT_ICONS[hash % SUBAGENT_ICONS.length] ?? "subagent-fork";
  return <span className="focused-session-kind" title={`Subagent, depth ${depth}`}><Icon name={icon} /><span className="focused-session-depth" aria-hidden="true">{depth}</span></span>;
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
    id={`workspace-agent-${encodeURIComponent(agent.id)}`}
    type="button"
    className={`focused-session-row ${isSubagent ? "subagent" : "root-agent"} ${active ? "active" : ""}`}
    aria-current={active ? "page" : undefined}
    aria-label={fullLabel}
    title={fullLabel}
    onClick={() => onOpen(agent)}
  >
    <span className="focused-session-copy">
      <span className="focused-session-title"><strong>{agent.name}</strong>{isSubagent && <SubagentMark agentId={agent.id} depth={subagentDepth} />}</span>
      <small>{context}</small>
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
        <span className="workspace-project-title">
          <strong>{project.label}</strong>
          <span className={`workspace-project-mark ${hasWorkingAgent ? "working" : ""}`} aria-hidden="true" />
        </span>
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

export function WorkspaceSidebar({ snapshot, activeProjectId, activeAgentId, loading, failed, opening, openError, compact, open, revealAgent, onClose, onSelectProject, onOpenAgent, onOpenDirectory }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly activeProjectId: string | undefined;
  readonly activeAgentId: string | undefined;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly opening: boolean;
  readonly openError: string | undefined;
  readonly compact: boolean;
  readonly open: boolean;
  readonly revealAgent: { readonly agentId: string; readonly requestId: number } | undefined;
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
  useLayoutEffect(() => {
    if (!open || revealAgent === undefined) return;
    if (agentView !== "agents") { setAgentView("agents"); return; }
    const frame = requestAnimationFrame(() => {
      const row = document.getElementById(`workspace-agent-${encodeURIComponent(revealAgent.agentId)}`);
      if (!(row instanceof HTMLButtonElement)) return;
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [agentView, open, revealAgent]);
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
      <strong id="workspace-navigation-title">ernie</strong>
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

