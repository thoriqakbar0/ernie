import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { WorkspaceAgent, WorkspaceSnapshot } from "../../../../shared/workspace";
import { orderRootAgentsByAttention } from "./agent-attention";
import { horizontalTabStep } from "../../lib/tab-keyboard-navigation";
import { flattenAgentHierarchy } from "../workspace/project-sidebar";
import { Icon } from "../ui/workspace-icon";
import { agentDisplayName, projectForAgent, statusText } from "../../lib/workspace-agent-presentation";

const SUBAGENT_ICONS = ["subagent-fork", "subagent-workflow", "subagent-network", "subagent-waypoints"] as const;

/** The explicit agent-list variants available in the sidebar. */
export type AgentView = "all" | "attention";

function SubagentMark({ agentId, depth }: { readonly agentId: string; readonly depth: number }) {
  let hash = 0;
  for (const character of agentId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const icon = SUBAGENT_ICONS[hash % SUBAGENT_ICONS.length] ?? "subagent-fork";
  return <span className="workspace-agent-kind" title={`Subagent, depth ${depth}`}><Icon name={icon} /><span className="workspace-agent-depth" aria-hidden="true">{depth}</span></span>;
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
    className={`workspace-agent-row ${isSubagent ? "subagent" : "root-agent"} ${active ? "selected" : ""}`}
    aria-current={active ? "page" : undefined}
    aria-label={fullLabel}
    title={fullLabel}
    data-status={agent.status}
    style={{ animationDelay: `calc(${entranceOrder} * var(--agent-row-stagger))` }}
    onClick={() => onOpen(agent)}
  >
    <span className="workspace-agent-copy">
      <span className="workspace-agent-title"><span className={`workspace-agent-status ${agent.status}`} aria-hidden="true" /><strong>{displayName}</strong>{isSubagent && <SubagentMark agentId={agent.id} depth={subagentDepth} />}</span>
      {context && <small>{context}</small>}
    </span>
  </button>;
}

/** Tabs that select one explicit agent pane. */
export function AgentViewTabs({ value, attentionCount, onChange }: {
  readonly value: AgentView;
  readonly attentionCount: number;
  readonly onChange: (view: AgentView) => void;
}) {
  const allRef = useRef<HTMLButtonElement>(null);
  const attentionRef = useRef<HTMLButtonElement>(null);
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = horizontalTabStep(event);
    const next = event.key === "Home" ? "all"
      : event.key === "End" ? "attention"
      : step !== undefined ? value === "all" ? "attention" : "all"
      : undefined;
    if (!next) return;
    event.preventDefault();
    onChange(next);
    (next === "all" ? allRef : attentionRef).current?.focus();
  };
  return <div className="workspace-agent-tabs" role="tablist" aria-label="Agent views" data-view={value}>
    <span className="workspace-agent-tab-indicator" aria-hidden="true" />
    <button ref={allRef} id="all-agents-tab" type="button" role="tab" aria-controls="agent-list-panel" aria-selected={value === "all"} className={value === "all" ? "active" : ""} tabIndex={value === "all" ? 0 : -1} onClick={() => onChange("all")} onKeyDown={moveFocus}>All</button>
    <button ref={attentionRef} id="attention-agents-tab" type="button" role="tab" aria-controls="agent-list-panel" aria-selected={value === "attention"} aria-label={`Attention, ${attentionCount} agents`} className={value === "attention" ? "active" : ""} tabIndex={value === "attention" ? 0 : -1} onClick={() => onChange("attention")} onKeyDown={moveFocus}>Attention <span aria-hidden="true">{attentionCount}</span></button>
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

function AgentTreeRow({ node, activeAgentId, expandSubagents, onOpenAgent }: {
  readonly node: AgentTreeNode;
  readonly activeAgentId: string | undefined;
  readonly expandSubagents: boolean;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  const [childrenExpanded, setChildrenExpanded] = useState(false);
  const foldedGroupId = useId();
  const foldedChildren = node.children.filter((child) => !containsAgent(child, activeAgentId));
  const visibleChildren = node.children.filter((child) => !foldedChildren.includes(child));
  const showFoldedChildren = expandSubagents || childrenExpanded;
  const foldedAgentCount = countAgentNodes(foldedChildren);
  const foldedLabel = `${foldedAgentCount} ${visibleChildren.length > 0 ? "more " : ""}${foldedAgentCount === 1 ? "subagent" : "subagents"}`;
  return <li>
    <SessionRow agent={node.agent} depth={node.depth} entranceOrder={node.entranceOrder} active={node.agent.id === activeAgentId} onOpen={onOpenAgent} />
    {node.children.length > 0 && <ul className="workspace-agent-children" aria-label={`Subagents of ${node.agent.name}`}>
      {visibleChildren.map((child) => <AgentTreeRow key={child.agent.id} node={child} activeAgentId={activeAgentId} expandSubagents={expandSubagents} onOpenAgent={onOpenAgent} />)}
      {foldedChildren.length > 0 && <li className="workspace-folded-subagents">
        <button
          type="button"
          className="workspace-folded-subagents-disclosure"
          aria-expanded={showFoldedChildren}
          aria-controls={foldedGroupId}
          onClick={() => { if (!expandSubagents) setChildrenExpanded((current) => !current); }}
        ><Icon name="chevron" /><span>{foldedLabel}</span></button>
        <ul id={foldedGroupId} className="workspace-folded-subagents-list" hidden={!showFoldedChildren}>
          {showFoldedChildren && foldedChildren.map((child) => <AgentTreeRow key={child.agent.id} node={child} activeAgentId={activeAgentId} expandSubagents={expandSubagents} onOpenAgent={onOpenAgent} />)}
        </ul>
      </li>}
    </ul>}
  </li>;
}

/** Attention agent variant with flat context labels. */
export function AttentionAgentPane({ snapshot, activeAgentId, emptyMessage, onOpenAgent }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly activeAgentId: string | undefined;
  readonly emptyMessage: string | undefined;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  const agents = orderRootAgentsByAttention(snapshot.agents);
  if (agents.length === 0) return <p className="workspace-message">{emptyMessage ?? "Nothing needs attention right now."}</p>;
  return <ul className="workspace-agent-list workspace-agent-attention-list">{agents.map((agent, index) => <li key={agent.id}>
    <SessionRow agent={agent} context={agentContext(snapshot, agent)} depth={0} entranceOrder={agents.length - index - 1} active={agent.id === activeAgentId} onOpen={onOpenAgent} />
  </li>)}</ul>;
}

interface AgentGroupModel {
  readonly id: string;
  readonly label: string;
  readonly current: boolean;
  readonly trees: readonly AgentTreeNode[];
}

function countAgentNodes(nodes: readonly AgentTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countAgentNodes(node.children), 0);
}

function AgentGroup({ group, orderedTrees, activeAgentId, forceExpanded, expandSubagents, onOpenAgent }: {
  readonly group: AgentGroupModel;
  readonly orderedTrees: readonly AgentTreeNode[];
  readonly activeAgentId: string | undefined;
  readonly forceExpanded: boolean;
  readonly expandSubagents: boolean;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  const [expanded, setExpanded] = useState<boolean>();
  const agentListId = useId();
  const displayedExpanded = forceExpanded || (expanded ?? group.current);
  const count = countAgentNodes(group.trees);
  return <li className="workspace-agent-group" data-current={group.current || undefined}>
    <h3 className="workspace-agent-group-heading">
      <button
        type="button"
        aria-expanded={displayedExpanded}
        aria-controls={agentListId}
        aria-label={`${displayedExpanded ? "Hide" : "Show"} ${count} ${count === 1 ? "agent" : "agents"} in ${group.label}`}
        onClick={() => { if (!forceExpanded) setExpanded(!displayedExpanded); }}
      >
        <Icon name="chevron" />
        <span>{group.label}</span>
        {group.current && <small>Current</small>}
        <em aria-label={`${count} ${count === 1 ? "agent" : "agents"}`}>{count}</em>
      </button>
    </h3>
    <div id={agentListId} hidden={!displayedExpanded}>
      {displayedExpanded && (orderedTrees.length > 0
        ? <ul className="workspace-agent-list">{orderedTrees.map((node) => <AgentTreeRow key={node.agent.id} node={node} activeAgentId={activeAgentId} expandSubagents={expandSubagents} onOpenAgent={onOpenAgent} />)}</ul>
        : <p className="workspace-message">No agents yet</p>)}
    </div>
  </li>;
}

/** All-agent variant with worktree headings and nested subagents. */
export function AllAgentPane({ snapshot, activeWorktreeId, activeAgentId, expandSubagents, includeEmptyActiveWorktree, emptyMessage, onOpenAgent }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly activeWorktreeId: string | undefined;
  readonly activeAgentId: string | undefined;
  readonly expandSubagents: boolean;
  readonly includeEmptyActiveWorktree: boolean;
  readonly emptyMessage: string | undefined;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  const groups = snapshot.projects.flatMap((project) => project.worktreeIds.flatMap((worktreeId) => {
    const worktree = snapshot.worktrees.find((candidate) => candidate.id === worktreeId);
    if (!worktree) return [];
    const trees = agentTree(snapshot.agents.filter((agent) => agent.worktreeId === worktreeId));
    const current = worktreeId === activeWorktreeId;
    const label = project.label === worktree.label ? project.label : `${project.label} · ${worktree.label}`;
    return trees.length > 0 || (includeEmptyActiveWorktree && current) ? [{ id: worktreeId, label, current, trees }] : [];
  }));
  const orderedGroups = [...groups].sort((left, right) => Number(right.current) - Number(left.current));
  const orderedTrees = orderAgentTreeEntrances(orderedGroups.flatMap((group) => group.trees));
  if (orderedGroups.length === 0) return <p className="workspace-message">{emptyMessage ?? "No agents are available yet."}</p>;
  return <ul className="workspace-agent-groups">{orderedGroups.map((group) => <AgentGroup
    key={group.id}
    group={group}
    orderedTrees={orderedTrees.filter((node) => node.agent.worktreeId === group.id)}
    activeAgentId={activeAgentId}
    forceExpanded={expandSubagents}
    expandSubagents={expandSubagents}
    onOpenAgent={onOpenAgent}
  />)}</ul>;
}
