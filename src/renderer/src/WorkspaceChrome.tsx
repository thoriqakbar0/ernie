import { useEffect, useRef } from "react";
import type { WorkspaceAgent, WorkspaceSnapshot, WorkspaceWorktree } from "../../shared/workspace";
import type { WorkspaceTab } from "./workspaceTabs";

interface WorkspaceTreeProps {
  readonly snapshot: WorkspaceSnapshot;
  readonly currentSessionId: string;
  readonly activeAgentId: string;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}

function statusLabel(agent: WorkspaceAgent): string {
  return agent.status === "working" ? "Working" : agent.status === "waiting" ? "Waiting" : agent.status;
}

/** Worktree-first navigation with recursively nested Prime Agent sessions. */
export function WorkspaceTree({ snapshot, currentSessionId, activeAgentId, onOpenAgent }: WorkspaceTreeProps) {
  const agentsByWorktree = new Map<string, WorkspaceAgent[]>();
  for (const agent of snapshot.agents) {
    const agents = agentsByWorktree.get(agent.worktreeId) ?? [];
    agents.push(agent);
    agentsByWorktree.set(agent.worktreeId, agents);
  }
  const worktreesByParent = new Map<string | undefined, WorkspaceWorktree[]>();
  const knownWorktreeIds = new Set(snapshot.worktrees.map((worktree) => worktree.id));
  const safeParentByWorktree = new Map<string, string | undefined>();
  for (const worktree of snapshot.worktrees) {
    let parent = worktree.parentWorktreeId && worktree.parentWorktreeId !== worktree.id && knownWorktreeIds.has(worktree.parentWorktreeId) ? worktree.parentWorktreeId : undefined;
    let cursor = parent;
    const visited = new Set([worktree.id]);
    while (cursor !== undefined) {
      if (visited.has(cursor)) { parent = undefined; break; }
      visited.add(cursor);
      cursor = safeParentByWorktree.get(cursor);
    }
    safeParentByWorktree.set(worktree.id, parent);
    const worktrees = worktreesByParent.get(parent) ?? [];
    worktrees.push(worktree);
    worktreesByParent.set(parent, worktrees);
  }

  const renderAgents = (worktreeId: string) => {
    const agents = agentsByWorktree.get(worktreeId) ?? [];
    const knownIds = new Set(agents.map((agent) => agent.id));
    const byParent = new Map<string | undefined, WorkspaceAgent[]>();
    const safeParentByAgent = new Map<string, string | undefined>();
    for (const agent of agents) {
      let parent = agent.parentAgentId && agent.parentAgentId !== agent.id && knownIds.has(agent.parentAgentId) ? agent.parentAgentId : undefined;
      let cursor = parent;
      const visited = new Set([agent.id]);
      while (cursor !== undefined) {
        if (visited.has(cursor)) { parent = undefined; break; }
        visited.add(cursor);
        cursor = safeParentByAgent.get(cursor);
      }
      safeParentByAgent.set(agent.id, parent);
      const siblings = byParent.get(parent) ?? [];
      siblings.push(agent);
      byParent.set(parent, siblings);
    }
    const renderLevel = (parent: string | undefined, depth: number): React.ReactNode => (byParent.get(parent) ?? []).map((agent) => <div key={agent.id} role="none">
      <button
        type="button"
        role="treeitem"
        aria-selected={agent.id === activeAgentId}
        className={`agent-tree-row ${agent.id === activeAgentId ? "active" : ""}`}
        style={{ paddingInlineStart: `${10 + depth * 17}px` }}
        onClick={() => onOpenAgent(agent)}
      >
        <span className={`agent-state ${agent.status}`} aria-hidden="true" />
        <span className="agent-tree-copy"><strong>{agent.sessionId === currentSessionId ? "Current agent" : agent.name}</strong><small>{agent.summary || statusLabel(agent)}</small></span>
        {agent.runtimeKind === "subagent" && <span className="agent-kind">child</span>}
      </button>
      {renderLevel(agent.id, depth + 1)}
    </div>);
    return renderLevel(undefined, 0);
  };

  const renderWorktrees = (parent: string | undefined, depth: number): React.ReactNode => (worktreesByParent.get(parent) ?? []).map((worktree) => <div key={worktree.id} role="none" className="worktree-group">
    <div className="worktree-row" role="treeitem" aria-expanded="true" style={{ paddingInlineStart: `${7 + depth * 14}px` }}>
      <span className="worktree-disclosure" aria-hidden="true">⌄</span>
      <span className="worktree-icon" aria-hidden="true">◇</span>
      <span>{worktree.label}</span>
      <span className="worktree-count">{(agentsByWorktree.get(worktree.id) ?? []).length}</span>
    </div>
    <div role="group">{renderAgents(worktree.id)}{renderWorktrees(worktree.id, depth + 1)}</div>
  </div>);

  return <>
    <div className="rail-section-label worktree-heading">Worktrees</div>
    <div className="worktree-tree" role="tree" aria-label="Worktrees and agents">
      {snapshot.worktrees.length > 0 ? renderWorktrees(undefined, 0) : <div className="worktree-empty">Worktrees appear here when the catalog connects.</div>}
    </div>
  </>;
}

/** Fixed workspace-level entry point for worktree orchestration. */
export function WorktreeManager({ active, onOpen }: { readonly active: boolean; readonly onOpen: () => void }) {
  return <button type="button" className={`worktree-manager ${active ? "active" : ""}`} onClick={onOpen}>
    <span className="manager-mark" aria-hidden="true">⌘</span>
    <span><strong>Worktree manager</strong><small>Create and coordinate work</small></span>
  </button>;
}

/** Read-only worktree manager surface until daemon-backed create/retire commands land. */
export function WorktreeManagerDialog({ open, snapshot, onClose, onNewThread }: {
  readonly open: boolean;
  readonly snapshot: WorkspaceSnapshot;
  readonly onClose: () => void;
  readonly onNewThread: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const keyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [onClose, open]);
  if (!open) return null;
  return <div className="tab-chooser-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="tab-chooser worktree-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="manager-title">
      <div className="tab-chooser-heading"><div><h2 id="manager-title">Worktree manager</h2><p>Inspect the workspace without changing a running agent.</p></div><button ref={closeButton} type="button" onClick={onClose} aria-label="Close worktree manager">×</button></div>
      <div className="manager-summary"><strong>{snapshot.worktrees.length}</strong><span>worktrees</span><strong>{snapshot.agents.length}</strong><span>agents</span></div>
      <div className="manager-worktree-list">
        {snapshot.worktrees.map((worktree) => <div key={worktree.id}><span className="worktree-icon" aria-hidden="true">◇</span><span><strong>{worktree.label}</strong><small>{worktree.path}</small></span><em>{snapshot.agents.filter((agent) => agent.worktreeId === worktree.id).length} agents</em></div>)}
      </div>
      <div className="manager-footer"><span>Worktree create and retire commands require the daemon adapter.</span><button type="button" onClick={onNewThread}>New thread in current worktree</button></div>
    </section>
  </div>;
}

interface WorkspaceTabStripProps {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId: string;
  readonly onSelect: (tabId: string) => void;
  readonly onClose: (tabId: string) => void;
  readonly onAdd: () => void;
}

/** Global tab strip whose views may span multiple worktrees. */
export function WorkspaceTabStrip({ tabs, activeTabId, onSelect, onClose, onAdd }: WorkspaceTabStripProps) {
  return <div className="workspace-tab-strip no-drag" role="tablist" aria-label="Open workspace surfaces" onKeyDown={(event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === activeTabId);
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + offset + tabs.length) % tabs.length];
    if (next) onSelect(next.id);
  }}>
    {tabs.map((tab) => <div className={`workspace-tab-shell ${tab.id === activeTabId ? "active" : ""}`} key={tab.id}>
      <button
        type="button"
        role="tab"
        aria-selected={tab.id === activeTabId}
        className="workspace-tab"
        onClick={() => onSelect(tab.id)}
      >
        <span className={`tab-state ${tab.status}`} aria-hidden="true" />
        <span>{tab.title}</span>
      </button>
      {!tab.pinned && <button type="button" className="tab-close" aria-label={`Close ${tab.title}`} onClick={() => onClose(tab.id)}>×</button>}
    </div>)}
    <button type="button" className="workspace-tab-add" aria-label="Open agent tab" onClick={onAdd}>+</button>
  </div>;
}

/** Read-only selected-agent view until a daemon-backed conversation attachment is available. */
export function AgentOverview({ agent, onReturn }: { readonly agent: WorkspaceAgent; readonly onReturn: () => void }) {
  return <section className="agent-overview">
    <div className={`agent-overview-mark ${agent.status}`} aria-hidden="true">↳</div>
    <div className="agent-overview-path">{agent.runtimeKind === "subagent" ? "Subagent" : "Agent"} · {statusLabel(agent)}</div>
    <h1>{agent.name}</h1>
    <p>{agent.summary || "This agent has not published a task summary yet."}</p>
    {agent.answerPreview && <div className="agent-answer-preview"><span>Latest result</span>{agent.answerPreview}</div>}
    <div className="agent-overview-actions"><button type="button" onClick={onReturn}>Return to current agent</button><span>Live transcript attachment comes next.</span></div>
  </section>;
}


/** Explicit stale-tab state; it never exposes the current root composer. */
export function DetachedAgentOverview({ tab, onReturn }: { readonly tab: WorkspaceTab; readonly onReturn: () => void }) {
  return <section className="agent-overview detached-agent">
    <div className="agent-overview-mark disconnected" aria-hidden="true">○</div>
    <div className="agent-overview-path">Detached agent view</div>
    <h1>{tab.title}</h1>
    <p>This agent is no longer present in the live workspace catalog. Closing this view will not stop or delete its saved session.</p>
    <div className="agent-overview-actions"><button type="button" onClick={onReturn}>Return to current agent</button><span>Commands are disabled for detached views.</span></div>
  </section>;
}

/** Chooser used by the global plus button to open known agents as tabs. */
export function AgentTabChooser({ open, snapshot, onClose, onChoose }: {
  readonly open: boolean;
  readonly snapshot: WorkspaceSnapshot;
  readonly onClose: () => void;
  readonly onChoose: (agent: WorkspaceAgent) => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const keyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [onClose, open]);
  if (!open) return null;
  const worktreeById = new Map(snapshot.worktrees.map((worktree) => [worktree.id, worktree]));
  return <div className="tab-chooser-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="tab-chooser" role="dialog" aria-modal="true" aria-labelledby="tab-chooser-title">
      <div className="tab-chooser-heading"><div><h2 id="tab-chooser-title">Open agent tab</h2><p>Tabs can span every worktree in this workspace.</p></div><button ref={closeButton} type="button" onClick={onClose} aria-label="Close tab chooser">×</button></div>
      <div className="tab-chooser-list">
        {snapshot.agents.length > 0 ? snapshot.agents.map((agent) => <button key={agent.id} type="button" onClick={() => onChoose(agent)}>
          <span className={`agent-state ${agent.status}`} aria-hidden="true" />
          <span><strong>{agent.name}</strong><small>{worktreeById.get(agent.worktreeId)?.label ?? "Worktree"} · {agent.summary || statusLabel(agent)}</small></span>
          <span className="tab-chooser-open">Open</span>
        </button>) : <div className="tab-chooser-empty">No additional agents are available yet.</div>}
      </div>
    </section>
  </div>;
}
