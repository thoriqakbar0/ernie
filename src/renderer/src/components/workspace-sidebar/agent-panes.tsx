import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { WorkspaceAgent, WorkspaceSnapshot } from "../../../../shared/workspace";
import { orderRootAgentsByAttention } from "./agent-attention";
import { horizontalTabStep } from "../../lib/tab-keyboard-navigation";
import { flattenAgentHierarchy } from "../workspace/project-sidebar";
import { Icon } from "../ui/workspace-icon";
import { agentDisplayName, statusText } from "../../lib/workspace-agent-presentation";

/** The explicit agent-list variants available in the sidebar. */
export type AgentView = "all" | "attention";

function SessionRow({ agent, active, context, depth = 0, onOpen }: {
  readonly agent: WorkspaceAgent;
  readonly active: boolean;
  readonly context?: string;
  readonly depth?: number;
  readonly onOpen: (agent: WorkspaceAgent) => void;
}) {
  const status = statusText(agent.status);
  const isSubagent = agent.runtimeKind === "subagent";
  const subagentDepth = isSubagent ? Math.max(1, depth) : 0;
  const fullLabel = [agent.name, isSubagent ? `Subagent, depth ${subagentDepth}` : undefined, status, context].filter(Boolean).join(" — ");
  const displayName = agentDisplayName(agent.name);
  const visibleStatus = agent.status === "working" || agent.status === "waiting" || agent.status === "failed" ? status : undefined;
  return <button
    id={`workspace-agent-${encodeURIComponent(agent.id)}`}
    type="button"
    className={`workspace-agent-row ${isSubagent ? "subagent" : "root-agent"} ${active ? "selected" : ""}`}
    aria-current={active ? "page" : undefined}
    aria-label={fullLabel}
    title={fullLabel}
    data-status={agent.status}
    onClick={() => onOpen(agent)}
  >
    <span className="workspace-agent-copy">
      <span className="workspace-agent-title"><span className={`workspace-agent-status ${agent.status}`} aria-hidden="true" /><strong>{displayName}</strong>{visibleStatus && <span className="workspace-agent-status-label" aria-hidden="true">{visibleStatus}</span>}</span>
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
  return <div className="workspace-agent-tabs" role="tablist" aria-label="Agent views">
    <button ref={allRef} id="all-agents-tab" type="button" role="tab" aria-controls="agent-list-panel" aria-selected={value === "all"} aria-label="All agents grouped by component" className={value === "all" ? "active" : ""} tabIndex={value === "all" ? 0 : -1} onClick={() => onChange("all")} onKeyDown={moveFocus}>All</button>
    <button ref={attentionRef} id="attention-agents-tab" type="button" role="tab" aria-controls="agent-list-panel" aria-selected={value === "attention"} aria-label={`Agents needing attention grouped by component, ${attentionCount} agents`} className={value === "attention" ? "active" : ""} tabIndex={value === "attention" ? 0 : -1} onClick={() => onChange("attention")} onKeyDown={moveFocus}>Attention <span aria-hidden="true">{attentionCount}</span></button>
  </div>;
}

interface AgentTreeNode {
  readonly agent: WorkspaceAgent;
  readonly depth: number;
  readonly children: AgentTreeNode[];
}

function agentTree(agents: readonly WorkspaceAgent[]): readonly AgentTreeNode[] {
  const roots: AgentTreeNode[] = [];
  const stack: AgentTreeNode[] = [];
  const flattened = flattenAgentHierarchy(agents);
  for (const { agent, depth } of flattened) {
    const node: AgentTreeNode = { agent, depth, children: [] };
    if (depth === 0) roots.push(node);
    else stack[depth - 1]?.children.push(node);
    stack.length = depth;
    stack.push(node);
  }
  return roots;
}

function containsAgent(node: AgentTreeNode, agentId: string | undefined): boolean {
  return agentId !== undefined && (node.agent.id === agentId || node.children.some((child) => containsAgent(child, agentId)));
}

interface AgentGroupModel {
  readonly id: string;
  readonly label: string;
  readonly current: boolean;
  readonly trees: readonly AgentTreeNode[];
}

function agentGroupLabel(projectLabel: string, worktreeLabel: string): string {
  return projectLabel === worktreeLabel ? projectLabel : `${projectLabel} · ${worktreeLabel}`;
}

function orderAgentGroups(groups: readonly AgentGroupModel[]): readonly AgentGroupModel[] {
  return groups.toSorted((left, right) => Number(right.current) - Number(left.current) || left.label.localeCompare(right.label));
}

function groupAgentsByWorktree(snapshot: WorkspaceSnapshot, agents: readonly WorkspaceAgent[], activeWorktreeId: string | undefined, includeEmptyActiveWorktree: boolean): readonly AgentGroupModel[] {
  const groups = snapshot.projects.flatMap((project) => project.worktreeIds.flatMap((worktreeId) => {
    const worktree = snapshot.worktrees.find((candidate) => candidate.id === worktreeId);
    if (!worktree) return [];
    const trees = agentTree(agents.filter((agent) => agent.worktreeId === worktreeId));
    const current = worktreeId === activeWorktreeId;
    return trees.length > 0 || (includeEmptyActiveWorktree && current)
      ? [{ id: worktreeId, label: agentGroupLabel(project.label, worktree.label), current, trees }]
      : [];
  }));
  return orderAgentGroups(groups);
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
  const foldedLabel = showFoldedChildren
    ? `Hide ${foldedAgentCount} ${foldedAgentCount === 1 ? "subagent" : "subagents"}`
    : `Show ${foldedAgentCount} ${visibleChildren.length > 0 ? "more " : ""}${foldedAgentCount === 1 ? "subagent" : "subagents"}`;
  return <li>
    <SessionRow agent={node.agent} depth={node.depth} active={node.agent.id === activeAgentId} onOpen={onOpenAgent} />
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

/** Attention agent variant grouped by component with the current context first. */
export function AttentionAgentPane({ snapshot, activeWorktreeId, activeAgentId, emptyMessage, onOpenAgent }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly activeWorktreeId: string | undefined;
  readonly activeAgentId: string | undefined;
  readonly emptyMessage: string | undefined;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}) {
  const attentionAgents = orderRootAgentsByAttention(snapshot.agents);
  const orderedGroups = groupAgentsByWorktree(snapshot, attentionAgents, activeWorktreeId, true);
  if (orderedGroups.length === 0) return <p className="workspace-message">{emptyMessage ?? "Nothing needs attention right now."}</p>;
  return <ul className="workspace-agent-groups workspace-agent-attention-groups">{orderedGroups.map((group) => <AgentGroup
    key={group.id}
    group={group}
    trees={group.trees}
    activeAgentId={activeAgentId}
    forceExpanded={false}
    expandSubagents={false}
    emptyMessage="Nothing needs attention here"
    onOpenAgent={onOpenAgent}
  />)}</ul>;
}

function countAgentNodes(nodes: readonly AgentTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countAgentNodes(node.children), 0);
}

function AgentGroup({ group, trees, activeAgentId, forceExpanded, expandSubagents, emptyMessage = "No agents yet", onOpenAgent }: {
  readonly group: AgentGroupModel;
  readonly trees: readonly AgentTreeNode[];
  readonly activeAgentId: string | undefined;
  readonly forceExpanded: boolean;
  readonly expandSubagents: boolean;
  readonly emptyMessage?: string;
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
      {displayedExpanded && (trees.length > 0
        ? <ul className="workspace-agent-list">{trees.map((node) => <AgentTreeRow key={node.agent.id} node={node} activeAgentId={activeAgentId} expandSubagents={expandSubagents} onOpenAgent={onOpenAgent} />)}</ul>
        : <p className="workspace-message">{emptyMessage}</p>)}
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
  const orderedGroups = groupAgentsByWorktree(snapshot, snapshot.agents, activeWorktreeId, includeEmptyActiveWorktree);
  if (orderedGroups.length === 0) return <p className="workspace-message">{emptyMessage ?? "No agents are available yet."}</p>;
  return <ul className="workspace-agent-groups">{orderedGroups.map((group) => <AgentGroup
    key={group.id}
    group={group}
    trees={group.trees}
    activeAgentId={activeAgentId}
    forceExpanded={expandSubagents}
    expandSubagents={expandSubagents}
    onOpenAgent={onOpenAgent}
  />)}</ul>;
}
