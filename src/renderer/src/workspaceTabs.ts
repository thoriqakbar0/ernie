import type { AgentStatus, WorkspaceAgent } from "../../shared/workspace";

/** One open view onto an agent chat surface. */
export interface WorkspaceTab {
  readonly id: string;
  readonly agentId: string;
  readonly worktreeId: string;
  readonly title: string;
  readonly status: AgentStatus;
  readonly pinned: boolean;
}

/** Local tab navigation; opening and closing never mutates an agent. */
export interface WorkspaceTabsState {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId: string;
}

/** Closed set of legal tab navigation transitions. */
export type WorkspaceTabsAction =
  | { readonly type: "open_agent"; readonly agent: WorkspaceAgent }
  | { readonly type: "select"; readonly tabId: string }
  | { readonly type: "close"; readonly tabId: string }
  | { readonly type: "sync_agents"; readonly agents: readonly WorkspaceAgent[] }
  | { readonly type: "sync_root"; readonly agentId: string; readonly worktreeId: string; readonly title: string; readonly status: AgentStatus };

/** Creates the pinned tab for Ernie's commandable root RPC session. */
export function initialWorkspaceTabs(root: { readonly agentId: string; readonly worktreeId: string; readonly title: string }): WorkspaceTabsState {
  const tab: WorkspaceTab = { id: "root", agentId: root.agentId, worktreeId: root.worktreeId, title: root.title, status: "idle", pinned: true };
  return { tabs: [tab], activeTabId: tab.id };
}

/** Applies deterministic tab navigation without starting, stopping, or deleting agents. */
export function workspaceTabsReducer(state: WorkspaceTabsState, action: WorkspaceTabsAction): WorkspaceTabsState {
  switch (action.type) {
    case "open_agent": {
      const existing = state.tabs.find((tab) => tab.agentId === action.agent.id);
      if (existing) return { ...state, activeTabId: existing.id };
      const tab: WorkspaceTab = {
        id: `agent:${action.agent.id}`,
        agentId: action.agent.id,
        worktreeId: action.agent.worktreeId,
        title: action.agent.name,
        status: action.agent.status,
        pinned: false,
      };
      return { tabs: [...state.tabs, tab], activeTabId: tab.id };
    }
    case "select":
      return state.tabs.some((tab) => tab.id === action.tabId) ? { ...state, activeTabId: action.tabId } : state;
    case "close": {
      const closing = state.tabs.find((tab) => tab.id === action.tabId);
      if (!closing || closing.pinned) return state;
      const index = state.tabs.indexOf(closing);
      const tabs = state.tabs.filter((tab) => tab.id !== action.tabId);
      if (state.activeTabId !== action.tabId) return { ...state, tabs };
      const next = tabs[Math.min(index, tabs.length - 1)] ?? tabs[0];
      return next ? { tabs, activeTabId: next.id } : state;
    }
    case "sync_root":
      return {
        ...state,
        tabs: state.tabs.map((tab) => tab.pinned ? { ...tab, agentId: action.agentId, worktreeId: action.worktreeId, title: action.title, status: action.status } : tab),
      };
    case "sync_agents": {
      const byId = new Map(action.agents.map((agent) => [agent.id, agent]));
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.pinned) return tab;
          const agent = byId.get(tab.agentId);
          return agent ? { ...tab, title: agent.name, status: agent.status, worktreeId: agent.worktreeId } : { ...tab, status: "disconnected" };
        }),
      };
    }
  }
}


/** Resolves the selected view without ever falling a stale child tab through to the commandable root. */
export type WorkspaceTabSurface =
  | { readonly kind: "root"; readonly tab: WorkspaceTab }
  | { readonly kind: "agent"; readonly tab: WorkspaceTab; readonly agent: WorkspaceAgent }
  | { readonly kind: "detached"; readonly tab: WorkspaceTab };

export function resolveWorkspaceTabSurface(state: WorkspaceTabsState, agents: readonly WorkspaceAgent[]): WorkspaceTabSurface {
  const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId) ?? state.tabs[0];
  if (!tab) throw new Error("Workspace tab state must retain its pinned root");
  if (tab.pinned) return { kind: "root", tab };
  const agent = agents.find((candidate) => candidate.id === tab.agentId);
  return agent ? { kind: "agent", tab, agent } : { kind: "detached", tab };
}


/** Reconciles authoritative catalog state with stronger live RPC transport signals. */
export function resolveRootTabStatus(ready: boolean, streaming: boolean, catalogStatus?: AgentStatus): AgentStatus {
  if (!ready) return "disconnected";
  if (streaming) return "working";
  return catalogStatus ?? "idle";
}
