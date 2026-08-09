import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { WorkspaceAgent, WorkspaceSnapshot } from "../../../../shared/workspace";
import { prioritizeRootAgents } from "./agent-priority";
import { horizontalTabStep } from "../../lib/tab-keyboard-navigation";
import { flattenAgentHierarchy } from "../workspace/project-sidebar";
import { Icon } from "../ui/workspace-icon";
import { agentDisplayName, projectForAgent, statusText } from "../../lib/workspace-agent-presentation";

const SUBAGENT_ICONS = ["subagent-fork", "subagent-workflow", "subagent-network", "subagent-waypoints"] as const;

/** The explicit agent-list variants available in the sidebar. */
export type AgentView = "agents" | "priority";

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

/** Tabs that select one explicit agent pane. */
export function AgentViewTabs({ value, priorityCount, onChange }: {
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

/** Priority agent variant with flat context labels. */
export function PriorityAgentPane({ snapshot, activeAgentId, emptyMessage, onOpenAgent }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly activeAgentId: string | undefined;
  readonly emptyMessage: string | undefined;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  const agents = prioritizeRootAgents(snapshot.agents);
  if (agents.length === 0) return <p className="focused-message">{emptyMessage ?? "Nothing needs attention right now."}</p>;
  return <ul className="workspace-agent-list workspace-agent-priority-list">{agents.map((agent, index) => <li key={agent.id}>
    <SessionRow agent={agent} context={agentContext(snapshot, agent)} depth={0} entranceOrder={agents.length - index - 1} active={agent.id === activeAgentId} onOpen={onOpenAgent} />
  </li>)}</ul>;
}

/** Grouped agent variant with worktree headings and nested subagents. */
export function GroupedAgentPane({ snapshot, activeWorktreeId, activeAgentId, expandIdleSubagents, includeEmptyActiveWorktree, emptyMessage, onOpenAgent }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly activeWorktreeId: string | undefined;
  readonly activeAgentId: string | undefined;
  readonly expandIdleSubagents: boolean;
  readonly includeEmptyActiveWorktree: boolean;
  readonly emptyMessage: string | undefined;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  const groups = snapshot.projects.flatMap((project) => project.worktreeIds.flatMap((worktreeId) => {
    const worktree = snapshot.worktrees.find((candidate) => candidate.id === worktreeId);
    if (!worktree) return [];
    const trees = agentTree(snapshot.agents.filter((agent) => agent.worktreeId === worktreeId));
    const active = worktreeId === activeWorktreeId;
    const label = project.label === worktree.label ? project.label : `${project.label} · ${worktree.label}`;
    return trees.length > 0 || (includeEmptyActiveWorktree && active) ? [{ id: worktreeId, label, active, trees }] : [];
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
