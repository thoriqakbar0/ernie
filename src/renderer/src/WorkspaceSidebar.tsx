import { useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { WorkspaceAgent, WorkspaceProject, WorkspaceSnapshot, WorkspaceWorktree } from "../../shared/workspace";
import { prioritizeRootAgents } from "./agentPriority";
import { horizontalTabStep } from "./tabKeyboardNavigation";
import { flattenAgentHierarchy } from "./ProjectSidebar";
import { Icon } from "./WorkspaceIcon";
import { agentDisplayName, projectForAgent, statusText } from "./workspaceAgentPresentation";

const SUBAGENT_ICONS = ["subagent-fork", "subagent-workflow", "subagent-network", "subagent-waypoints"] as const;
type SettledWorktree = NonNullable<WorkspaceSnapshot["settledWorktrees"]>[number];

function SubagentMark({ agentId, depth }: { readonly agentId: string; readonly depth: number }) {
  let hash = 0;
  for (const character of agentId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const icon = SUBAGENT_ICONS[hash % SUBAGENT_ICONS.length] ?? "subagent-fork";
  return <span className="focused-session-kind" title={`Subagent, depth ${depth}`}><Icon name={icon} /><span className="focused-session-depth" aria-hidden="true">{depth}</span></span>;
}

function SessionRow({ agent, active, context, depth = 0, entranceOrder = 0, onOpen }: {
  readonly agent: WorkspaceAgent;
  readonly active: boolean;
  readonly context?: string;
  readonly depth?: number;
  readonly entranceOrder?: number;
  readonly onOpen: (agent: WorkspaceAgent) => void;
}) {
  const status = statusText(agent.status);
  const isSubagent = agent.runtimeKind === "subagent";
  const subagentDepth = isSubagent ? Math.max(1, depth) : 0;
  const fullLabel = [agent.name, isSubagent ? `Subagent, depth ${subagentDepth}` : undefined, status, context].filter(Boolean).join(" — ");
  const displayName = agentDisplayName(agent.name);
  return <button
    id={`workspace-agent-${encodeURIComponent(agent.id)}`}
    type="button"
    className={`focused-session-row ${isSubagent ? "subagent" : "root-agent"} ${active ? "active" : ""}`}
    aria-current={active ? "page" : undefined}
    aria-label={fullLabel}
    title={fullLabel}
    data-status={agent.status}
    style={{ animationDelay: `calc(${entranceOrder} * var(--agent-row-stagger))` }}
    onClick={() => onOpen(agent)}
  >
    <span className="focused-session-copy">
      <span className="focused-session-title"><span className={`focused-status ${agent.status}`} aria-hidden="true" /><strong>{displayName}</strong>{isSubagent && <SubagentMark agentId={agent.id} depth={subagentDepth} />}</span>
      {context && <small>{context}</small>}
    </span>
  </button>;
}

function WorktreeRow({ projectId, worktree, active, working, busy, disabled, onSelect, onArchive }: {
  readonly projectId: string;
  readonly worktree: WorkspaceWorktree;
  readonly active: boolean;
  readonly working: boolean;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onSelect: (projectId: string, worktreeId: string) => void;
  readonly onArchive: (projectId: string, worktree: WorkspaceWorktree) => void;
}) {
  const label = `${worktree.label}${working ? ", working" : ""}`;
  const pathParts = worktree.path.split("/").filter(Boolean);
  const displayPath = pathParts.length <= 2 ? worktree.path : `…/${pathParts.slice(-2).join("/")}`;
  return <li className="workspace-worktree-connector-row">
    <div className={`workspace-worktree-control ${active ? "active" : ""}`} aria-busy={busy || undefined}>
      <button
        id={`workspace-worktree-${encodeURIComponent(worktree.id)}`}
        type="button"
        className="workspace-worktree-button"
        aria-current={active ? "page" : undefined}
        aria-label={label}
        title={worktree.path}
        onClick={() => onSelect(projectId, worktree.id)}
      >
        <span className="workspace-worktree-connector" aria-hidden="true" />
        <span className="workspace-worktree-copy">
          <span className="workspace-worktree-title">
            <strong>{worktree.label}</strong>
            <span className={`workspace-worktree-mark ${working ? "working" : ""}`} aria-hidden="true" />
          </span>
          <small>{displayPath}</small>
        </span>
      </button>
      <button
        type="button"
        className="workspace-worktree-archive"
        aria-label={`Archive ${worktree.label}`}
        title={`Move ${worktree.label} to Settled`}
        disabled={disabled}
        onClick={() => onArchive(projectId, worktree)}
      ><Icon name="archive" /></button>
    </div>
  </li>;
}

function CreateWorktreeForm({ id, project, sourceWorktree, busy, error, onCreate, onCancel }: {
  readonly id: string;
  readonly project: WorkspaceProject;
  readonly sourceWorktree: WorkspaceWorktree;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly onCreate: (projectId: string, sourceWorktreeId: string, branch: string) => void;
  readonly onCancel: (restoreFocus: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [branch, setBranch] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState<string>();
  const errorId = useId();
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = branch.trim();
    if (trimmed === "") {
      setValidationError("Enter a branch name.");
      inputRef.current?.focus();
      return;
    }
    setValidationError(undefined);
    setSubmitted(true);
    onCreate(project.id, sourceWorktree.id, trimmed);
  };
  const visibleError = validationError ?? (submitted ? error : undefined);
  return <form id={id} className="workspace-create-worktree" aria-label={`Create worktree in ${project.label}`} aria-busy={busy || undefined} onSubmit={submit} onKeyDown={(event) => {
    if (event.key !== "Escape" || busy) return;
    event.preventDefault();
    onCancel(true);
  }}>
    <label htmlFor={`worktree-branch-${encodeURIComponent(project.id)}`}>Branch name</label>
    <input
      ref={inputRef}
      id={`worktree-branch-${encodeURIComponent(project.id)}`}
      name="branch"
      value={branch}
      placeholder="feature/name"
      autoComplete="off"
      spellCheck={false}
      disabled={busy}
      aria-invalid={visibleError ? true : undefined}
      aria-describedby={visibleError ? errorId : undefined}
      onChange={(event) => { setBranch(event.currentTarget.value); setSubmitted(false); setValidationError(undefined); }}
    />
    <small>Starts from {sourceWorktree.label}</small>
    {visibleError && <p id={errorId} role="alert">{visibleError}</p>}
    <footer>
      <button type="button" disabled={busy} onClick={() => onCancel(true)}>Cancel</button>
      <button type="submit" disabled={busy}><Icon name="branch-add" /><span>{busy ? "Creating…" : "Create worktree"}</span></button>
    </footer>
  </form>;
}

interface SettledWorktreeEntry {
  readonly project: WorkspaceProject;
  readonly worktree: SettledWorktree;
}

function SettledWorktreeRow({ entry, busy, disabled, onRestore, onRemove }: {
  readonly entry: SettledWorktreeEntry;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onRestore: (projectId: string, worktree: SettledWorktree) => void;
  readonly onRemove: (projectId: string, worktree: SettledWorktree) => void;
}) {
  const { project, worktree } = entry;
  const context = `${project.label} · ${worktree.label}`;
  const removable = worktree.managed === true && worktree.checkoutPresent !== false;
  return <li className="workspace-settled-row" aria-busy={busy || undefined} data-removable={removable}>
    <span className="workspace-settled-copy" title={`${context} — ${worktree.path}`}>
      <strong>{context}</strong>
      <small>{worktree.checkoutPresent === false ? "Checkout removed" : worktree.path}</small>
    </span>
    <button
      id={`workspace-settled-restore-${encodeURIComponent(worktree.id)}`}
      type="button"
      aria-label={`Restore ${worktree.label} to ${project.label}`}
      title={`Restore ${worktree.label}`}
      disabled={disabled}
      onClick={() => onRestore(project.id, worktree)}
    ><Icon name="restore" /></button>
    {removable && <button
      type="button"
      className="workspace-settled-remove"
      aria-label={`Remove checkout ${worktree.label} from ${project.label}`}
      title={`Remove checkout ${worktree.label}`}
      disabled={disabled}
      onClick={() => onRemove(project.id, worktree)}
    ><Icon name="trash" /></button>}
  </li>;
}

function SpaceRow({ project, rootWorktree, linkedWorktrees, forceExpanded, archivable, archiving, activeProjectId, activeWorktreeId, workingWorktreeIds, createOpen, worktreeBusyOwner, worktreeInteractionLocked, createError, onOpenCreate, onCloseCreate, onCreateWorktree, onSelectProject, onSelectWorktree, onArchiveProject, onArchiveWorktree }: {
  readonly project: WorkspaceProject;
  readonly rootWorktree: WorkspaceWorktree | undefined;
  readonly linkedWorktrees: readonly WorkspaceWorktree[];
  readonly forceExpanded: boolean;
  readonly archivable: boolean;
  readonly archiving: boolean;
  readonly activeProjectId: string | undefined;
  readonly activeWorktreeId: string | undefined;
  readonly workingWorktreeIds: ReadonlySet<string>;
  readonly createOpen: boolean;
  readonly worktreeBusyOwner: string | undefined;
  readonly worktreeInteractionLocked: boolean;
  readonly createError: string | undefined;
  readonly onOpenCreate: (projectId: string) => void;
  readonly onCloseCreate: (projectId: string, restoreFocus: boolean) => void;
  readonly onCreateWorktree: (projectId: string, sourceWorktreeId: string, branch: string) => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly onSelectWorktree: (projectId: string, worktreeId: string) => void;
  readonly onArchiveProject: (project: WorkspaceProject) => void;
  readonly onArchiveWorktree: (projectId: string, worktree: WorkspaceWorktree) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const worktreeListId = useId();
  const createFormId = useId();
  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const createWasBusyRef = useRef(false);
  const rootRuntimeId = rootWorktree?.id ?? project.id;
  const rootWorking = workingWorktreeIds.has(rootRuntimeId);
  const activeRoot = project.id === activeProjectId && (activeWorktreeId === undefined || activeWorktreeId === rootRuntimeId);
  const rootContext = rootWorktree?.label ?? "Local directory";
  const visibleRootContext = rootContext === project.label ? undefined : rootContext;
  const rootLabel = `${project.label}, ${rootContext}${rootWorking ? ", working" : ""}`;
  const activeLinkedWorktree = linkedWorktrees.find((worktree) => worktree.id === activeWorktreeId);
  const hasLinkedWorktrees = linkedWorktrees.length > 0;
  const displayedExpanded = forceExpanded || expanded;
  const sourceWorktree = project.id === activeProjectId
    ? linkedWorktrees.find((worktree) => worktree.id === activeWorktreeId) ?? rootWorktree
    : rootWorktree;
  const createBusy = createOpen && worktreeBusyOwner === project.id;
  const mutationBusy = worktreeInteractionLocked;
  useLayoutEffect(() => {
    if (!createOpen) { createWasBusyRef.current = false; return; }
    if (createBusy) { createWasBusyRef.current = true; return; }
    if (!createWasBusyRef.current || createError !== undefined) return;
    createWasBusyRef.current = false;
    onCloseCreate(project.id, false);
  }, [createBusy, createError, createOpen, onCloseCreate, project.id]);

  return <li className="workspace-project-node">
    <div className={`workspace-project-control ${activeRoot ? "active" : ""}`}>
      <button id={`workspace-project-${encodeURIComponent(project.id)}`} type="button" className="workspace-project-row" aria-current={activeRoot ? "page" : undefined} aria-label={rootLabel} title={rootWorktree?.path ?? project.path} onClick={() => onSelectProject(project.id)}>
        <span className="workspace-project-title">
          <strong>{project.label}</strong>
          {visibleRootContext && <small>{visibleRootContext}</small>}
          <span className={`workspace-project-mark ${rootWorking ? "working" : ""}`} aria-hidden="true" />
        </span>
      </button>
      {sourceWorktree && <button
        ref={createTriggerRef}
        type="button"
        className="workspace-project-create"
        aria-label={`Create worktree in ${project.label}`}
        title={`Create worktree in ${project.label}`}
        aria-expanded={createOpen}
        aria-controls={createFormId}
        disabled={createBusy || (mutationBusy && !createOpen)}
        onClick={() => createOpen ? onCloseCreate(project.id, true) : onOpenCreate(project.id)}
      ><Icon name="branch-add" /></button>}
      {archivable && <button type="button" className="workspace-project-archive" aria-label={`Archive ${project.label}`} title={`Archive ${project.label}`} disabled={archiving || mutationBusy} onClick={() => onArchiveProject(project)}><Icon name="archive" /></button>}
      {hasLinkedWorktrees && <button
        type="button"
        className={`workspace-project-disclosure ${displayedExpanded ? "expanded" : ""}`}
        aria-expanded={displayedExpanded}
        aria-controls={worktreeListId}
        aria-label={`${displayedExpanded ? "Hide" : "Show"} linked worktrees for ${project.label}`}
        title={`${displayedExpanded ? "Hide" : "Show"} linked worktrees`}
        onClick={() => setExpanded((current) => !current)}
      ><Icon name="chevron" /></button>}
    </div>
    {createOpen && sourceWorktree && <CreateWorktreeForm
      id={createFormId}
      project={project}
      sourceWorktree={sourceWorktree}
      busy={createBusy}
      error={createError}
      onCreate={onCreateWorktree}
      onCancel={(restoreFocus) => {
        onCloseCreate(project.id, restoreFocus);
        if (restoreFocus) requestAnimationFrame(() => createTriggerRef.current?.focus());
      }}
    />}
    {hasLinkedWorktrees && <div id={worktreeListId} hidden={!displayedExpanded}>
      {displayedExpanded && <ul
        className="workspace-worktree-list workspace-linked-worktree-list"
        aria-label={`Linked worktrees for ${project.label}`}
      >
        {linkedWorktrees.map((worktree) => <WorktreeRow
          key={worktree.id}
          projectId={project.id}
          worktree={worktree}
          active={project.id === activeProjectId && worktree.id === activeWorktreeId}
          working={workingWorktreeIds.has(worktree.id)}
          busy={worktreeBusyOwner === worktree.id}
          disabled={mutationBusy}
          onSelect={onSelectWorktree}
          onArchive={onArchiveWorktree}
        />)}
      </ul>}
    </div>}
    {!displayedExpanded && activeLinkedWorktree && <ul
      className="workspace-worktree-list workspace-linked-worktree-list workspace-active-worktree-context"
      aria-label={`Active worktree in ${project.label}`}
      data-collapsed="true"
    >
      <WorktreeRow
        projectId={project.id}
        worktree={activeLinkedWorktree}
        active
        working={workingWorktreeIds.has(activeLinkedWorktree.id)}
        busy={worktreeBusyOwner === activeLinkedWorktree.id}
        disabled={mutationBusy}
        onSelect={onSelectWorktree}
        onArchive={onArchiveWorktree}
      />
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
  return <div className="workspace-agent-tabs" role="tablist" aria-label="Agent views" data-view={value}>
    <span className="workspace-agent-tab-indicator" aria-hidden="true" />
    <button ref={allRef} id="all-agents-tab" type="button" role="tab" aria-controls="agent-list-panel" aria-selected={value === "agents"} className={value === "agents" ? "active" : ""} tabIndex={value === "agents" ? 0 : -1} onClick={() => onChange("agents")} onKeyDown={moveFocus}>Grouped</button>
    <button ref={priorityRef} id="priority-tab" type="button" role="tab" aria-controls="agent-list-panel" aria-selected={value === "priority"} aria-label={`Priority, ${priorityCount} agents`} className={value === "priority" ? "active" : ""} tabIndex={value === "priority" ? 0 : -1} onClick={() => onChange("priority")} onKeyDown={moveFocus}>Priority <span aria-hidden="true">{priorityCount}</span></button>
  </div>;
}

function FirstSpaceEmptyState({ opening, onOpen }: {
  readonly opening: boolean;
  readonly onOpen: () => void;
}) {
  return <div className="workspace-empty-state">
    <p>No spaces yet. Open a local folder to create one.</p>
    <button type="button" className="workspace-empty-action" disabled={opening} onClick={onOpen}><Icon name="folder-add" /><span>{opening ? "Opening folder…" : "Open folder"}</span></button>
  </div>;
}

function agentContext(snapshot: WorkspaceSnapshot, agent: WorkspaceAgent): string {
  const project = projectForAgent(snapshot, agent);
  const worktree = snapshot.worktrees.find((candidate) => candidate.id === agent.worktreeId);
  return [project?.label, worktree?.label].filter(Boolean).join(" · ") || statusText(agent.status);
}

interface AgentTreeNode {
  readonly agent: WorkspaceAgent;
  readonly depth: number;
  readonly entranceOrder: number;
  readonly children: AgentTreeNode[];
}

function agentTree(agents: readonly WorkspaceAgent[]): readonly AgentTreeNode[] {
  const roots: AgentTreeNode[] = [];
  const stack: AgentTreeNode[] = [];
  const flattened = flattenAgentHierarchy(agents);
  for (const { agent, depth } of flattened) {
    const node: AgentTreeNode = { agent, depth, entranceOrder: 0, children: [] };
    if (depth === 0) roots.push(node);
    else stack[depth - 1]?.children.push(node);
    stack.length = depth;
    stack.push(node);
  }
  return roots;
}

function orderAgentTreeEntrances(trees: readonly AgentTreeNode[]): readonly AgentTreeNode[] {
  const count = (nodes: readonly AgentTreeNode[]): number => nodes.reduce((total, node) => total + 1 + count(node.children), 0);
  const total = count(trees);
  let displayIndex = 0;
  const assign = (node: AgentTreeNode): AgentTreeNode => {
    const entranceOrder = total - displayIndex - 1;
    displayIndex += 1;
    return { ...node, entranceOrder, children: node.children.map(assign) };
  };
  return trees.map(assign);
}

function containsAgent(node: AgentTreeNode, agentId: string | undefined): boolean {
  return agentId !== undefined && (node.agent.id === agentId || node.children.some((child) => containsAgent(child, agentId)));
}

function isIdleBranch(node: AgentTreeNode): boolean {
  return node.agent.status === "idle" && node.children.every(isIdleBranch);
}

function AgentTreeRow({ node, activeAgentId, expandIdleSubagents, onOpenAgent }: {
  readonly node: AgentTreeNode;
  readonly activeAgentId: string | undefined;
  readonly expandIdleSubagents: boolean;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  const [idleExpanded, setIdleExpanded] = useState(false);
  const idleGroupId = useId();
  const foldedChildren = node.children.filter((child) => isIdleBranch(child) && !containsAgent(child, activeAgentId));
  const visibleChildren = node.children.filter((child) => !foldedChildren.includes(child));
  const showFoldedChildren = expandIdleSubagents || idleExpanded;
  return <li>
    <SessionRow agent={node.agent} depth={node.depth} entranceOrder={node.entranceOrder} active={node.agent.id === activeAgentId} onOpen={onOpenAgent} />
    {node.children.length > 0 && <ul className="workspace-agent-children" aria-label={`Subagents of ${node.agent.name}`}>
      {visibleChildren.map((child) => <AgentTreeRow key={child.agent.id} node={child} activeAgentId={activeAgentId} expandIdleSubagents={expandIdleSubagents} onOpenAgent={onOpenAgent} />)}
      {foldedChildren.length > 0 && <li className="workspace-idle-subagents">
        <button
          type="button"
          className="workspace-idle-subagents-disclosure"
          aria-expanded={showFoldedChildren}
          aria-controls={idleGroupId}
          onClick={() => { if (!expandIdleSubagents) setIdleExpanded((current) => !current); }}
        ><Icon name="chevron" /><span>{foldedChildren.length} idle {foldedChildren.length === 1 ? "subagent" : "subagents"}</span></button>
        <ul id={idleGroupId} className="workspace-idle-subagents-list" hidden={!showFoldedChildren}>
          {showFoldedChildren && foldedChildren.map((child) => <AgentTreeRow key={child.agent.id} node={child} activeAgentId={activeAgentId} expandIdleSubagents={expandIdleSubagents} onOpenAgent={onOpenAgent} />)}
        </ul>
      </li>}
    </ul>}
  </li>;
}

function matchesSearch(query: string, values: readonly (string | undefined)[]): boolean {
  return values.some((value) => value?.toLocaleLowerCase().includes(query));
}

function agentIdsWithAncestors(agents: readonly WorkspaceAgent[], matches: readonly WorkspaceAgent[]): ReadonlySet<string> {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const included = new Set(matches.map((agent) => agent.id));
  for (const match of matches) {
    let current = match;
    for (let depth = 0; depth < agents.length && current.parentAgentId !== undefined; depth += 1) {
      const parent = byId.get(current.parentAgentId);
      if (parent === undefined || included.has(parent.id)) break;
      included.add(parent.id);
      current = parent;
    }
  }
  return included;
}

function AgentPane({ snapshot, view, activeWorktreeId, activeAgentId, expandIdleSubagents, showActiveWorktree, emptyMessage, onOpenAgent }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly view: AgentView;
  readonly activeWorktreeId: string | undefined;
  readonly activeAgentId: string | undefined;
  readonly expandIdleSubagents: boolean;
  readonly showActiveWorktree: boolean;
  readonly emptyMessage: string | undefined;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  if (view === "priority") {
    const agents = prioritizeRootAgents(snapshot.agents);
    if (agents.length === 0) return <p className="focused-message">{emptyMessage ?? "Nothing needs attention right now."}</p>;
    return <ul className="workspace-agent-list workspace-agent-priority-list">{agents.map((agent, index) => <li key={agent.id}>
      <SessionRow agent={agent} context={agentContext(snapshot, agent)} depth={0} entranceOrder={agents.length - index - 1} active={agent.id === activeAgentId} onOpen={onOpenAgent} />
    </li>)}</ul>;
  }
  const groups = snapshot.projects.flatMap((project) => project.worktreeIds.flatMap((worktreeId) => {
    const worktree = snapshot.worktrees.find((candidate) => candidate.id === worktreeId);
    if (!worktree) return [];
    const trees = agentTree(snapshot.agents.filter((agent) => agent.worktreeId === worktreeId));
    const active = worktreeId === activeWorktreeId;
    const label = project.label === worktree.label ? project.label : `${project.label} · ${worktree.label}`;
    return trees.length > 0 || (showActiveWorktree && active) ? [{ id: worktreeId, label, active, trees }] : [];
  }));
  const orderedGroups = [...groups].sort((left, right) => Number(right.active) - Number(left.active));
  const orderedTrees = orderAgentTreeEntrances(orderedGroups.flatMap((group) => group.trees));
  if (orderedGroups.length === 0) return <p className="focused-message">{emptyMessage ?? "No agents are available yet."}</p>;
  return <ul className="workspace-agent-groups">{orderedGroups.map((group) => {
    const trees = orderedTrees.filter((node) => node.agent.worktreeId === group.id);
    return <li key={group.id} className="workspace-agent-group" data-active={group.active || undefined}>
      <h3 className="workspace-agent-group-heading"><span>{group.label}</span>{group.active && <small>Active</small>}</h3>
      {trees.length > 0
        ? <ul className="workspace-agent-list">{trees.map((node) => <AgentTreeRow key={node.agent.id} node={node} activeAgentId={activeAgentId} expandIdleSubagents={expandIdleSubagents} onOpenAgent={onOpenAgent} />)}</ul>
        : <p className="workspace-agent-group-empty">No agents yet</p>}
    </li>;
  })}</ul>;
}

export function WorkspaceSidebar({ snapshot, activeProjectId, activeWorktreeId, activeAgentId, loading, failed, opening, archivingProjectId, openError, worktreeBusyOwner, worktreeError, compact, open, revealAgent, performanceEnabled, onTogglePerformance, onClose, onSelectProject, onSelectWorktree, onArchiveProject, onCreateWorktree, onArchiveWorktree, onRestoreWorktree, onRemoveWorktree, onOpenAgent, onOpenDirectory }: {
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
  const [agentView, setAgentView] = useState<AgentView>("agents");
  const [spacesExpanded, setSpacesExpanded] = useState(true);
  const [agentsExpanded, setAgentsExpanded] = useState(true);
  const [agentViewDirection, setAgentViewDirection] = useState<"forward" | "backward">("forward");
  const [agentPaneMotion, setAgentPaneMotion] = useState<"horizontal" | "vertical">("vertical");
  const [searchQuery, setSearchQuery] = useState("");
  const [createProjectId, setCreateProjectId] = useState<string>();
  const [settledExpanded, setSettledExpanded] = useState(true);
  const settledShelfId = useId();
  const settledHeaderRef = useRef<HTMLButtonElement>(null);
  const pendingSettledFocusRef = useRef<{ readonly id: string; readonly index: number; readonly kind: "restore" | "remove" } | undefined>(undefined);
  const pendingArchiveFocusRef = useRef<{ readonly projectId: string; readonly worktreeId: string } | undefined>(undefined);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const settledEntries: readonly SettledWorktreeEntry[] = (snapshot.settledWorktrees ?? []).flatMap((worktree) => {
    const project = snapshot.projects.find((candidate) => candidate.id === worktree.projectId);
    return project === undefined ? [] : [{ project, worktree }];
  });
  const visibleProjects = normalizedQuery === "" ? snapshot.projects : snapshot.projects.filter((project) => {
    const activeWorktrees = project.worktreeIds.flatMap((id) => snapshot.worktrees.find((worktree) => worktree.id === id) ?? []);
    return matchesSearch(normalizedQuery, [project.label, project.path, ...activeWorktrees.flatMap((worktree) => [worktree.label, worktree.path])]);
  });
  const visibleSettledEntries = normalizedQuery === "" ? settledEntries : settledEntries.filter(({ project, worktree }) =>
    matchesSearch(normalizedQuery, [project.label, project.path, worktree.label, worktree.path]));
  const matchingAgents = normalizedQuery === "" ? snapshot.agents : snapshot.agents.filter((agent) => {
    const project = projectForAgent(snapshot, agent);
    const worktree = snapshot.worktrees.find((candidate) => candidate.id === agent.worktreeId);
    return matchesSearch(normalizedQuery, [agent.name, agent.summary, statusText(agent.status), project?.label, project?.path, worktree?.label, worktree?.path]);
  });
  const visibleAgentIds = normalizedQuery === "" ? new Set(snapshot.agents.map((agent) => agent.id)) : agentIdsWithAncestors(snapshot.agents, matchingAgents);
  const groupedAgents = normalizedQuery === "" ? snapshot.agents : snapshot.agents.filter((agent) => visibleAgentIds.has(agent.id));
  const priorityAgents = prioritizeRootAgents(matchingAgents);
  const visibleAgents = agentView === "priority" ? matchingAgents : groupedAgents;
  const visibleSnapshot = normalizedQuery === "" ? snapshot : { ...snapshot, agents: visibleAgents };
  const visibleAgentMatchCount = agentView === "priority" ? priorityAgents.length : matchingAgents.length;
  const searchResultStatus = `${visibleProjects.length} ${visibleProjects.length === 1 ? "Space" : "Spaces"}, ${visibleSettledEntries.length} settled ${visibleSettledEntries.length === 1 ? "worktree" : "worktrees"}, and ${visibleAgentMatchCount} ${visibleAgentMatchCount === 1 ? "Agent" : "Agents"} match your search.`;
  const changeAgentView = (next: AgentView) => {
    if (next === agentView) return;
    setAgentPaneMotion("horizontal");
    setAgentViewDirection(next === "priority" ? "forward" : "backward");
    setAgentView(next);
  };
  const toggleAgentsExpanded = () => {
    if (!agentsExpanded) setAgentPaneMotion("vertical");
    setAgentsExpanded((current) => !current);
  };
  const changeSearchQuery = (value: string) => {
    setSearchQuery(value);
    if (value.trim() === "") return;
    setCreateProjectId(undefined);
    setSpacesExpanded(true);
    if (!agentsExpanded) { setAgentPaneMotion("vertical"); setAgentsExpanded(true); }
  };
  const clearSearch = () => {
    setSearchQuery("");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const handledRevealRequestRef = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (!compact || !open) return;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [compact, open]);
  useLayoutEffect(() => {
    if (!open || revealAgent === undefined || handledRevealRequestRef.current === revealAgent.requestId) return;
    if (!agentsExpanded) { setAgentPaneMotion("vertical"); setAgentsExpanded(true); return; }
    if (agentView !== "agents") { changeAgentView("agents"); return; }
    handledRevealRequestRef.current = revealAgent.requestId;
    const frame = requestAnimationFrame(() => {
      const row = document.getElementById(`workspace-agent-${encodeURIComponent(revealAgent.agentId)}`);
      if (!(row instanceof HTMLButtonElement)) return;
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [agentView, agentsExpanded, open, revealAgent]);
  useLayoutEffect(() => {
    if (createProjectId === undefined || snapshot.projects.some((project) => project.id === createProjectId)) return;
    setCreateProjectId(undefined);
  }, [createProjectId, snapshot.projects]);
  useLayoutEffect(() => {
    const pending = pendingArchiveFocusRef.current;
    if (pending === undefined || worktreeBusyOwner !== undefined) return;
    pendingArchiveFocusRef.current = undefined;
    if (snapshot.worktrees.some((worktree) => worktree.id === pending.worktreeId)) return;
    const frame = requestAnimationFrame(() => document.getElementById(`workspace-project-${encodeURIComponent(pending.projectId)}`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [snapshot.worktrees, worktreeBusyOwner]);
  useLayoutEffect(() => {
    const pending = pendingSettledFocusRef.current;
    if (pending === undefined || worktreeBusyOwner !== undefined) return;
    pendingSettledFocusRef.current = undefined;
    const target = settledEntries.find((entry) => entry.worktree.id === pending.id);
    if (target !== undefined) {
      if (pending.kind !== "remove" || target.worktree.checkoutPresent !== false) return;
      const frame = requestAnimationFrame(() => document.getElementById(`workspace-settled-restore-${encodeURIComponent(target.worktree.id)}`)?.focus());
      return () => cancelAnimationFrame(frame);
    }
    const candidates = [...settledEntries.slice(pending.index), ...settledEntries.slice(0, pending.index)].map((entry) => entry.worktree.id);
    const frame = requestAnimationFrame(() => {
      for (const id of candidates) {
        const button = document.getElementById(`workspace-settled-restore-${encodeURIComponent(id)}`);
        if (button instanceof HTMLButtonElement) { button.focus(); return; }
      }
      settledHeaderRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [settledEntries, worktreeBusyOwner]);
  const archiveWorktree = (projectId: string, worktree: WorkspaceWorktree) => {
    pendingArchiveFocusRef.current = { projectId, worktreeId: worktree.id };
    onArchiveWorktree(projectId, worktree);
  };
  const restoreWorktree = (projectId: string, worktree: SettledWorktree) => {
    pendingSettledFocusRef.current = { id: worktree.id, index: settledEntries.findIndex((entry) => entry.worktree.id === worktree.id), kind: "restore" };
    onRestoreWorktree(projectId, worktree);
  };
  const removeWorktree = (projectId: string, worktree: SettledWorktree) => {
    pendingSettledFocusRef.current = { id: worktree.id, index: settledEntries.findIndex((entry) => entry.worktree.id === worktree.id), kind: "remove" };
    onRemoveWorktree(projectId, worktree);
  };
  const priorityCount = priorityAgents.length;
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
      <div className="workspace-sidebar-toolbar">
        <strong id="workspace-navigation-title">Ernie Dev</strong>
        <div className="workspace-sidebar-actions">
          {import.meta.env.DEV && !compact && <button type="button" className="performance-toggle" aria-pressed={performanceEnabled} aria-label={`${performanceEnabled ? "Hide" : "Show"} performance diagnostics`} title="Performance diagnostics" onClick={onTogglePerformance}><span aria-hidden="true" /></button>}
          <button ref={closeButtonRef} type="button" className="workspace-sidebar-close" aria-label="Close workspace navigation" title="Close sidebar (⌘B)" onClick={onClose}><Icon name="sidebar-close" /></button>
        </div>
      </div>
      <div className="workspace-sidebar-search">
        <Icon name="search" />
        <input ref={searchInputRef} type="search" value={searchQuery} aria-label="Search Spaces, Settled worktrees, and Agents" placeholder="Search" spellCheck={false} onChange={(event) => changeSearchQuery(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Escape" && searchQuery !== "") { event.preventDefault(); clearSearch(); } }} />
        {searchQuery !== "" && <button type="button" aria-label="Clear search" title="Clear search" onClick={clearSearch}><Icon name="close" /></button>}
      </div>
    </header>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{normalizedQuery === "" ? `Workspace status: ${loading ? "Loading spaces" : failed ? "Spaces unavailable; retrying automatically" : "Spaces available"}` : searchResultStatus}</div>
    <div className="workspace-sidebar-body" data-spaces-expanded={spacesExpanded} data-agents-expanded={agentsExpanded}>
      <section id="spaces-panel" className="workspace-projects" aria-labelledby="spaces-heading">
        <header className="workspace-section-heading">
          <h2 id="spaces-heading"><button type="button" className="workspace-spaces-disclosure" aria-expanded={spacesExpanded} aria-controls="spaces-list-panel" onClick={() => setSpacesExpanded((current) => !current)}><Icon name="folder" /><span>Spaces</span><Icon name="chevron" /></button></h2>
          <button type="button" aria-label="Open folder" title="Open folder" disabled={opening} onClick={onOpenDirectory}><Icon name="folder-add" /></button>
        </header>
        {spacesExpanded && <div id="spaces-list-panel" className="workspace-project-scroll">
          {failed && <p className="focused-message error" role="alert">Spaces are temporarily unavailable. Ernie will retry automatically.</p>}
          {openError && <p className="focused-message error" role="alert">{openError}</p>}
          {worktreeError && createProjectId === undefined && <p className="focused-message error" role="alert">{worktreeError}</p>}
          {loading && snapshot.projects.length === 0 && <p className="focused-message" role="status">Loading spaces…</p>}
          {normalizedQuery === "" && !loading && snapshot.projects.length === 0 && <FirstSpaceEmptyState opening={opening} onOpen={onOpenDirectory} />}
          {normalizedQuery !== "" && visibleProjects.length === 0 && <p className="focused-message">No spaces match your search.</p>}
          <ul className="workspace-project-list">{visibleProjects.map((project) => {
            const worktrees = project.worktreeIds.flatMap((id) => snapshot.worktrees.find((worktree) => worktree.id === id) ?? []);
            const rootWorktree = worktrees.find((worktree) => worktree.id === project.id) ?? worktrees[0];
            const projectMatches = normalizedQuery !== "" && matchesSearch(normalizedQuery, [project.label, project.path]);
            const visibleWorktrees = normalizedQuery === "" || projectMatches
              ? worktrees
              : worktrees.filter((worktree) => matchesSearch(normalizedQuery, [worktree.label, worktree.path]));
            const linkedWorktrees = visibleWorktrees.filter((worktree) => worktree.id !== rootWorktree?.id);
            return <SpaceRow
              key={project.id}
              project={project}
              rootWorktree={rootWorktree}
              linkedWorktrees={linkedWorktrees}
              forceExpanded={normalizedQuery !== "" && linkedWorktrees.length > 0}
              archivable={snapshot.projects[0]?.id !== project.id}
              archiving={archivingProjectId === project.id}
              activeProjectId={activeProjectId}
              activeWorktreeId={activeWorktreeId}
              workingWorktreeIds={workingWorktreeIds}
              createOpen={createProjectId === project.id}
              worktreeBusyOwner={worktreeBusyOwner}
              worktreeInteractionLocked={worktreeBusyOwner !== undefined || createProjectId !== undefined}
              createError={createProjectId === project.id ? worktreeError : undefined}
              onOpenCreate={setCreateProjectId}
              onCloseCreate={(projectId) => setCreateProjectId((current) => current === projectId ? undefined : current)}
              onCreateWorktree={onCreateWorktree}
              onSelectProject={onSelectProject}
              onSelectWorktree={onSelectWorktree}
              onArchiveProject={onArchiveProject}
              onArchiveWorktree={archiveWorktree}
            />;
          })}</ul>
          {visibleSettledEntries.length > 0 && <section className="workspace-settled" aria-labelledby="settled-heading">
            <h3 id="settled-heading">
              <button
                ref={settledHeaderRef}
                type="button"
                className="workspace-settled-disclosure"
                aria-expanded={normalizedQuery !== "" || settledExpanded}
                aria-controls={settledShelfId}
                onClick={() => { if (normalizedQuery === "") setSettledExpanded((current) => !current); }}
              ><Icon name="archive" /><span>Settled</span><small aria-label={`${visibleSettledEntries.length} ${visibleSettledEntries.length === 1 ? "worktree" : "worktrees"}`}>{visibleSettledEntries.length}</small><Icon name="chevron" /></button>
            </h3>
            <ul id={settledShelfId} className="workspace-settled-list" hidden={normalizedQuery === "" && !settledExpanded}>
              {(normalizedQuery !== "" || settledExpanded) && visibleSettledEntries.map((entry) => <SettledWorktreeRow
                key={entry.worktree.id}
                entry={entry}
                busy={worktreeBusyOwner === entry.worktree.id}
                disabled={worktreeBusyOwner !== undefined || createProjectId !== undefined}
                onRestore={restoreWorktree}
                onRemove={removeWorktree}
              />)}
            </ul>
          </section>}
        </div>}
      </section>
      <div className="workspace-section-divider" aria-hidden="true" />
      <section id="agents-panel" className="workspace-sessions" aria-labelledby="agents-heading">
        <header className="workspace-section-heading agent-heading">
          <h2 id="agents-heading"><button type="button" className="workspace-agents-disclosure" aria-expanded={agentsExpanded} aria-controls="agent-list-panel" onClick={toggleAgentsExpanded}>Agents <Icon name="chevron" /></button></h2>
          {agentsExpanded && <AgentViewTabs value={agentView} priorityCount={priorityCount} onChange={changeAgentView} />}
        </header>
        {agentsExpanded && <div id="agent-list-panel" className="workspace-session-scroll" role="tabpanel" aria-labelledby={agentView === "agents" ? "all-agents-tab" : "priority-tab"}>
          <div key={agentView} className="workspace-agent-pane" data-direction={agentViewDirection} data-motion={agentPaneMotion}>
            <AgentPane snapshot={visibleSnapshot} view={agentView} activeWorktreeId={activeWorktreeId} activeAgentId={activeAgentId} expandIdleSubagents={normalizedQuery !== ""} showActiveWorktree={normalizedQuery === ""} emptyMessage={normalizedQuery === "" ? undefined : "No agents match your search."} onOpenAgent={onOpenAgent} />
          </div>
        </div>}
      </section>
    </div>
  </aside>;
}
