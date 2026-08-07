import { useEffect, useRef } from "react";
import type { ReactNode, SVGProps } from "react";
import type { WorkspaceAgent, WorkspaceSnapshot, WorkspaceWorktree } from "../../shared/workspace";
import { ModalDialog } from "./ModalDialog";
import type { WorkspaceTab } from "./workspaceTabs";

type IconName = "add" | "branch" | "chevron" | "close" | "detached" | "manager" | "subagent";

function Icon({ name, ...props }: { readonly name: IconName } & SVGProps<SVGSVGElement>) {
  const paths: Record<IconName, ReactNode> = {
    add: <path d="M12 5v14M5 12h14" />,
    branch: <><path d="M7 4v11a4 4 0 0 0 4 4h6" /><path d="m14 16 3 3-3 3" /><circle cx="7" cy="4" r="2" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    close: <path d="m7 7 10 10M17 7 7 17" />,
    detached: <circle cx="12" cy="12" r="7" />,
    manager: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h5" /></>,
    subagent: <><path d="M6 5v8a4 4 0 0 0 4 4h8" /><path d="m15 14 3 3-3 3" /></>,
  };
  return <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}

interface WorkspaceTreeProps {
  readonly snapshot: WorkspaceSnapshot;
  readonly currentSessionId: string;
  readonly activeAgentId: string;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
}

function statusLabel(agent: WorkspaceAgent): string {
  switch (agent.status) {
    case "working": return "Working";
    case "waiting": return "Waiting";
    case "idle": return "Idle";
    case "completed": return "Completed";
    case "failed": return "Failed";
    case "cancelled": return "Cancelled";
    case "disconnected": return "Disconnected";
  }
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/** Worktree-first navigation with recursively nested agent sessions. */
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
    const renderLevel = (parent: string | undefined, depth: number): ReactNode => {
      const children = byParent.get(parent) ?? [];
      if (children.length === 0) return null;
      return <ul>{children.map((agent) => {
        const displayName = agent.sessionId === currentSessionId ? "Current agent" : agent.name;
        const summary = agent.summary || statusLabel(agent);
        return <li key={agent.id}>
          <button
            type="button"
            aria-current={agent.id === activeAgentId ? "page" : undefined}
            className={`agent-tree-row ${agent.id === activeAgentId ? "active" : ""}`}
            style={{ paddingInlineStart: `${10 + depth * 17}px` }}
            onClick={() => onOpenAgent(agent)}
            title={`${displayName} — ${summary}`}
          >
            <span className={`agent-state ${agent.status}`} aria-hidden="true" />
            <span className="agent-tree-copy"><strong title={displayName}>{displayName}</strong><small title={summary}>{summary}</small></span>
            {agent.runtimeKind === "subagent" && <span className="agent-kind">Subagent</span>}
          </button>
          {renderLevel(agent.id, depth + 1)}
        </li>;
      })}</ul>;
    };
    return renderLevel(undefined, 0);
  };

  const renderWorktrees = (parent: string | undefined, depth: number): ReactNode => {
    const children = worktreesByParent.get(parent) ?? [];
    if (children.length === 0) return null;
    return <ul>{children.map((worktree) => {
      const agentCount = (agentsByWorktree.get(worktree.id) ?? []).length;
      return <li key={worktree.id} className="worktree-group">
        <div className="worktree-row" style={{ paddingInlineStart: `${7 + depth * 14}px` }} title={`${worktree.label} — ${worktree.path}`}>
          <span className="worktree-disclosure"><Icon name="chevron" /></span>
          <span className="worktree-icon"><Icon name="branch" /></span>
          <span title={worktree.label}>{worktree.label}</span>
          <span className="worktree-count" aria-label={countLabel(agentCount, "agent")}>{agentCount}</span>
        </div>
        {renderAgents(worktree.id)}
        {renderWorktrees(worktree.id, depth + 1)}
      </li>;
    })}</ul>;
  };

  return <>
    <div className="rail-section-label worktree-heading">Worktrees</div>
    <nav className="worktree-tree" aria-label="Worktrees and agents">
      {snapshot.worktrees.length > 0 ? renderWorktrees(undefined, 0) : <div className="worktree-empty">No worktrees are available.</div>}
    </nav>
  </>;
}

/** Fixed workspace-level entry point for inspecting worktrees and agents. */
export function WorktreeManager({ active, onOpen }: { readonly active: boolean; readonly onOpen: () => void }) {
  return <button type="button" className={`worktree-manager ${active ? "active" : ""}`} onClick={onOpen}>
    <span className="manager-mark"><Icon name="manager" /></span>
    <span><strong>Worktree manager</strong><small>Inspect worktrees and agents</small></span>
  </button>;
}

/** Read-only worktree and agent manager surface. */
export function WorktreeManagerDialog({ open, snapshot, onClose, onNewThread }: {
  readonly open: boolean;
  readonly snapshot: WorkspaceSnapshot;
  readonly onClose: () => void;
  readonly onNewThread: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  return <ModalDialog open={open} onRequestClose={onClose} labelledBy="manager-title" className="tab-chooser worktree-manager-dialog" initialFocusRef={closeButton}>
    <div className="tab-chooser-heading"><div><h2 id="manager-title">Worktree manager</h2><p>Inspect worktrees and agents.</p></div><button ref={closeButton} type="button" onClick={onClose} aria-label="Close worktree manager"><Icon name="close" /></button></div>
    <div className="manager-summary"><strong>{snapshot.worktrees.length}</strong><span>{snapshot.worktrees.length === 1 ? "worktree" : "worktrees"}</span><strong>{snapshot.agents.length}</strong><span>{snapshot.agents.length === 1 ? "agent" : "agents"}</span></div>
    <div className="manager-worktree-list">
      {snapshot.worktrees.length > 0 ? snapshot.worktrees.map((worktree) => {
        const agentCount = snapshot.agents.filter((agent) => agent.worktreeId === worktree.id).length;
        return <div key={worktree.id} title={`${worktree.label} — ${worktree.path}`}><span className="worktree-icon"><Icon name="branch" /></span><span><strong title={worktree.label}>{worktree.label}</strong><small title={worktree.path}>{worktree.path}</small></span><em>{countLabel(agentCount, "agent")}</em></div>;
      }) : <div className="tab-chooser-empty">No worktrees are available.</div>}
    </div>
    <div className="manager-footer"><button type="button" onClick={onNewThread}>New thread in current worktree</button></div>
  </ModalDialog>;
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
  const tabElements = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusTabId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const tabId = pendingFocusTabId.current;
    if (tabId === undefined || tabId !== activeTabId) return;
    pendingFocusTabId.current = undefined;
    tabElements.current.get(tabId)?.focus();
  }, [activeTabId, tabs]);

  const selectAndFocus = (tabId: string) => {
    pendingFocusTabId.current = tabId;
    onSelect(tabId);
  };

  return <div className="workspace-tab-strip no-drag">
    <div className="workspace-tab-viewport" role="tablist" aria-label="Open workspace surfaces" onKeyDown={(event) => {
      const target = event.target as HTMLElement;
      if (target.getAttribute("role") !== "tab") return;
      const index = tabs.findIndex((tab) => tab.id === activeTabId);
      if (index < 0 || tabs.length === 0) return;
      const direction = getComputedStyle(event.currentTarget).direction;
      if (event.key === "Delete" || event.key === "Backspace") {
        const activeTab = tabs[index];
        if (!activeTab || activeTab.pinned) return;
        event.preventDefault();
        const next = tabs[index + 1] ?? tabs[index - 1];
        if (next) pendingFocusTabId.current = next.id;
        onClose(activeTab.id);
        return;
      }
      let nextIndex: number | undefined;
      if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else if (event.key === "ArrowRight") nextIndex = (index + (direction === "rtl" ? -1 : 1) + tabs.length) % tabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (index + (direction === "rtl" ? 1 : -1) + tabs.length) % tabs.length;
      if (nextIndex === undefined) return;
      event.preventDefault();
      const next = tabs[nextIndex];
      if (next) selectAndFocus(next.id);
    }}>
      {tabs.map((tab) => <div className={`workspace-tab-shell ${tab.id === activeTabId ? "active" : ""}`} key={tab.id}>
        <button
          ref={(element) => { if (element) tabElements.current.set(tab.id, element); else tabElements.current.delete(tab.id); }}
          id={`workspace-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={tab.id === activeTabId}
          aria-controls={`workspace-panel-${tab.id}`}
          tabIndex={tab.id === activeTabId ? 0 : -1}
          className="workspace-tab"
          onClick={() => onSelect(tab.id)}
          title={tab.title}
        >
          <span className={`tab-state ${tab.status}`} aria-hidden="true" />
          <span title={tab.title}>{tab.title}</span>
        </button>
        {!tab.pinned && <button type="button" tabIndex={-1} className="tab-close" aria-label={`Close ${tab.title}`} title={`Close ${tab.title}`} onClick={() => onClose(tab.id)}><Icon name="close" /></button>}
      </div>)}
    </div>
    <button type="button" className="workspace-tab-add" aria-label="Open agent tab" title="Open agent tab" onClick={onAdd}><Icon name="add" /></button>
  </div>;
}

/** Read-only selected-agent view. */
export function AgentOverview({ agent }: { readonly agent: WorkspaceAgent }) {
  const summary = agent.summary || "No task summary is available.";
  return <section className="agent-overview">
    <div className={`agent-overview-mark ${agent.status}`}><Icon name="subagent" /></div>
    <div className="agent-overview-path">{agent.runtimeKind === "subagent" ? "Subagent" : "Agent"} · {statusLabel(agent)}</div>
    <h1 title={agent.name}>{agent.name}</h1>
    <p title={summary}>{summary}</p>
    {agent.answerPreview && <div className="agent-answer-preview" title={agent.answerPreview}><span>Latest result</span>{agent.answerPreview}</div>}
  </section>;
}

/** Explicit stale-tab state; it never exposes the current root composer. */
export function DetachedAgentOverview({ tab }: { readonly tab: WorkspaceTab }) {
  return <section className="agent-overview detached-agent">
    <div className="agent-overview-mark disconnected"><Icon name="detached" /></div>
    <div className="agent-overview-path">Detached agent view</div>
    <h1 title={tab.title}>{tab.title}</h1>
    <p>This agent is no longer present in the workspace. Closing this view will not stop or delete its saved session.</p>
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
  const worktreeById = new Map(snapshot.worktrees.map((worktree) => [worktree.id, worktree]));
  return <ModalDialog open={open} onRequestClose={onClose} labelledBy="tab-chooser-title" className="tab-chooser" initialFocusRef={closeButton}>
    <div className="tab-chooser-heading"><div><h2 id="tab-chooser-title">Open agent tab</h2><p>Open an agent from any worktree.</p></div><button ref={closeButton} type="button" onClick={onClose} aria-label="Close tab chooser"><Icon name="close" /></button></div>
    <div className="tab-chooser-list">
      {snapshot.agents.length > 0 ? snapshot.agents.map((agent) => {
        const worktreeLabel = worktreeById.get(agent.worktreeId)?.label ?? "Unknown worktree";
        const summary = agent.summary || statusLabel(agent);
        return <button key={agent.id} type="button" onClick={() => onChoose(agent)} title={`${agent.name} — ${worktreeLabel} — ${summary}`}>
          <span className={`agent-state ${agent.status}`} aria-hidden="true" />
          <span><strong title={agent.name}>{agent.name}</strong><small title={`${worktreeLabel} · ${summary}`}>{worktreeLabel} · {summary}</small></span>
          <span className="tab-chooser-open">Open</span>
        </button>;
      }) : <div className="tab-chooser-empty">No agents are available.</div>}
    </div>
  </ModalDialog>;
}
