import type { AgentStatus, WorkspaceAgent, WorkspaceSnapshot, WorkspaceWorktree } from "../../shared/workspace";

export type WorktreeAttachment = "unknown" | "attached" | "detached";

/** One open view onto a worktree. Agent selection is local to that worktree view. */
export interface WorkspaceTab {
  readonly id: string;
  readonly worktreeId: string;
  readonly selectedAgentId: string;
  /** @deprecated Use selectedAgentId. Kept while tab consumers migrate. */
  readonly agentId: string;
  readonly title: string;
  readonly status: AgentStatus;
  readonly pinned: boolean;
  readonly attachment: WorktreeAttachment;
}

/** Local worktree navigation. The catalog is cached only to make later opens fail closed. */
export interface WorkspaceTabsState {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId: string;
  readonly rootAgentId: string;
  readonly rootWorktreeId: string;
  readonly catalogWorktrees: readonly WorkspaceWorktree[] | undefined;
}

export type WorkspaceTabsAction =
  | { readonly type: "open_worktree"; readonly worktree: WorkspaceWorktree }
  | { readonly type: "open_agent"; readonly agent: WorkspaceAgent; readonly worktree?: WorkspaceWorktree }
  | { readonly type: "select"; readonly tabId: string }
  | { readonly type: "close"; readonly tabId: string }
  | { readonly type: "sync_workspace"; readonly worktrees: readonly WorkspaceWorktree[]; readonly agents: readonly WorkspaceAgent[] }
  /** Compatibility transition. It deliberately makes no claims about Git worktree existence. */
  | { readonly type: "sync_agents"; readonly agents: readonly WorkspaceAgent[] }
  | { readonly type: "sync_root"; readonly agentId: string; readonly worktreeId: string; readonly title: string; readonly status: AgentStatus };

function worktreeTabId(worktreeId: string): string {
  return `worktree:${worktreeId}`;
}

function fallbackWorktreeTitle(worktreeId: string): string {
  const normalized = worktreeId.replace(/[\/]+$/, "");
  return normalized.split(/[\/]/).at(-1) || worktreeId;
}

function withSelectedAgent(tab: WorkspaceTab, agentId: string, status: AgentStatus): WorkspaceTab {
  return { ...tab, selectedAgentId: agentId, agentId, status };
}

/** Creates the pinned view for the root worktree and its commandable root RPC session. */
export function initialWorkspaceTabs(root: { readonly agentId: string; readonly worktreeId: string; readonly title: string }): WorkspaceTabsState {
  const tab: WorkspaceTab = {
    id: "root",
    worktreeId: root.worktreeId,
    selectedAgentId: root.agentId,
    agentId: root.agentId,
    title: root.title,
    status: "idle",
    pinned: true,
    attachment: "unknown",
  };
  return {
    tabs: [tab],
    activeTabId: tab.id,
    rootAgentId: root.agentId,
    rootWorktreeId: root.worktreeId,
    catalogWorktrees: undefined,
  };
}

function reconcileAgents(tabs: readonly WorkspaceTab[], agents: readonly WorkspaceAgent[]): readonly WorkspaceTab[] {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  return tabs.map((tab) => {
    if (tab.selectedAgentId === "") return tab;
    const agent = byId.get(tab.selectedAgentId);
    return agent && agent.worktreeId === tab.worktreeId
      ? withSelectedAgent(tab, agent.id, agent.status)
      : { ...tab, status: "disconnected" };
  });
}

/** Applies deterministic worktree navigation without starting, stopping, or deleting agents. */
export function workspaceTabsReducer(state: WorkspaceTabsState, action: WorkspaceTabsAction): WorkspaceTabsState {
  switch (action.type) {
    case "open_worktree": {
      const existing = state.tabs.find((tab) => tab.worktreeId === action.worktree.id);
      if (existing) return { ...state, activeTabId: existing.id };
      const tab: WorkspaceTab = {
        id: worktreeTabId(action.worktree.id),
        worktreeId: action.worktree.id,
        selectedAgentId: "",
        agentId: "",
        title: action.worktree.label,
        status: "idle",
        pinned: false,
        attachment: "attached",
      };
      return { ...state, tabs: [...state.tabs, tab], activeTabId: tab.id };
    }
    case "open_agent": {
      const existing = state.tabs.find((tab) => tab.worktreeId === action.agent.worktreeId);
      if (existing) {
        const selected = withSelectedAgent(existing, action.agent.id, action.agent.status);
        const updated: WorkspaceTab = action.worktree
          ? { ...selected, title: action.worktree.label, attachment: "attached" }
          : existing.attachment === "detached" ? { ...selected, status: "disconnected" } : selected;
        return {
          ...state,
          tabs: state.tabs.map((tab) => tab.id === existing.id ? updated : tab),
          activeTabId: existing.id,
        };
      }

      const catalogWorktree = action.worktree ?? state.catalogWorktrees?.find((worktree) => worktree.id === action.agent.worktreeId);
      const attachment: WorktreeAttachment = state.catalogWorktrees === undefined || action.worktree
        ? (catalogWorktree ? "attached" : "unknown")
        : "detached";
      const tab: WorkspaceTab = {
        id: worktreeTabId(action.agent.worktreeId),
        worktreeId: action.agent.worktreeId,
        selectedAgentId: action.agent.id,
        agentId: action.agent.id,
        title: catalogWorktree?.label ?? fallbackWorktreeTitle(action.agent.worktreeId),
        status: attachment === "detached" ? "disconnected" : action.agent.status,
        pinned: false,
        attachment,
      };
      return { ...state, tabs: [...state.tabs, tab], activeTabId: tab.id };
    }
    case "select":
      return state.tabs.some((tab) => tab.id === action.tabId) ? { ...state, activeTabId: action.tabId } : state;
    case "close": {
      const closingIndex = state.tabs.findIndex((tab) => tab.id === action.tabId);
      if (closingIndex < 0 || state.tabs[closingIndex]?.pinned) return state;
      const tabs = state.tabs.filter((tab) => tab.id !== action.tabId);
      if (state.activeTabId !== action.tabId) return { ...state, tabs };
      const next = tabs[Math.min(closingIndex, tabs.length - 1)] ?? tabs[0];
      return next ? { ...state, tabs, activeTabId: next.id } : state;
    }
    case "sync_root": {
      const rootTab = state.tabs.find((tab) => tab.pinned);
      if (!rootTab) return state;
      const rootWasSelected = rootTab.selectedAgentId === state.rootAgentId;
      const worktreeChanged = rootTab.worktreeId !== action.worktreeId;
      const selectedAgentId = rootWasSelected || worktreeChanged ? action.agentId : rootTab.selectedAgentId;
      const catalogWorktree = state.catalogWorktrees?.find((worktree) => worktree.id === action.worktreeId);
      const attachment: WorktreeAttachment = state.catalogWorktrees === undefined ? rootTab.attachment : catalogWorktree ? "attached" : "detached";
      const updated: WorkspaceTab = {
        ...rootTab,
        worktreeId: action.worktreeId,
        selectedAgentId,
        agentId: selectedAgentId,
        title: catalogWorktree?.label ?? action.title,
        status: attachment === "detached" ? "disconnected" : selectedAgentId === action.agentId ? action.status : rootTab.status,
        attachment,
      };
      const targetCollision = state.tabs.find((tab) => tab.id !== rootTab.id && tab.worktreeId === action.worktreeId);
      return {
        ...state,
        rootAgentId: action.agentId,
        rootWorktreeId: action.worktreeId,
        activeTabId: targetCollision?.id === state.activeTabId ? rootTab.id : state.activeTabId,
        tabs: state.tabs
          .filter((tab) => tab.id === rootTab.id || tab.worktreeId !== action.worktreeId)
          .map((tab) => tab.id === rootTab.id ? updated : tab),
      };
    }
    case "sync_agents":
      return { ...state, tabs: reconcileAgents(state.tabs, action.agents) };
    case "sync_workspace": {
      const worktreesById = new Map(action.worktrees.map((worktree) => [worktree.id, worktree]));
      const reconciled = reconcileAgents(state.tabs, action.agents).map((tab): WorkspaceTab => {
        const worktree = worktreesById.get(tab.worktreeId);
        return worktree
          ? { ...tab, title: worktree.label, attachment: "attached" }
          : { ...tab, status: "disconnected", attachment: "detached" };
      });
      return { ...state, tabs: reconciled, catalogWorktrees: action.worktrees };
    }
  }
}

export type DetachedWorkspaceTabReason = "missing_worktree" | "missing_agent" | "agent_worktree_mismatch";

/** A root surface is the only commandable variant. */
export type WorkspaceTabSurface =
  | { readonly kind: "root"; readonly tab: WorkspaceTab; readonly worktree?: WorkspaceWorktree }
  | { readonly kind: "agent"; readonly tab: WorkspaceTab; readonly agent: WorkspaceAgent; readonly worktree?: WorkspaceWorktree }
  | { readonly kind: "empty"; readonly tab: WorkspaceTab; readonly worktree: WorkspaceWorktree }
  | { readonly kind: "detached"; readonly tab: WorkspaceTab; readonly reason: DetachedWorkspaceTabReason };

/**
 * Resolves a selected worktree view without allowing stale state to fall through to root RPC.
 * Passing a snapshot enables the strongest, Git-authoritative attachment check. The agents-only
 * form is retained for consumers which have not yet migrated to `sync_workspace`.
 */
export function resolveWorkspaceTabSurface(
  state: WorkspaceTabsState,
  source: WorkspaceSnapshot | readonly WorkspaceAgent[],
): WorkspaceTabSurface {
  const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId) ?? state.tabs[0];
  if (!tab) throw new Error("Workspace tab state must retain its pinned root worktree");

  const snapshot = Array.isArray(source) ? undefined : source as WorkspaceSnapshot;
  const agents = Array.isArray(source) ? source as readonly WorkspaceAgent[] : snapshot!.agents;
  const worktree = snapshot?.worktrees.find((candidate) => candidate.id === tab.worktreeId)
    ?? state.catalogWorktrees?.find((candidate) => candidate.id === tab.worktreeId);
  if (snapshot ? !worktree : tab.attachment === "detached") {
    return { kind: "detached", tab, reason: "missing_worktree" };
  }

  if (
    tab.pinned
    && tab.worktreeId === state.rootWorktreeId
    && tab.selectedAgentId === state.rootAgentId
  ) {
    return worktree ? { kind: "root", tab, worktree } : { kind: "root", tab };
  }

  if (tab.selectedAgentId === "" && worktree) return { kind: "empty", tab, worktree };
  const agent = agents.find((candidate) => candidate.id === tab.selectedAgentId);
  if (!agent) return { kind: "detached", tab, reason: "missing_agent" };
  if (agent.worktreeId !== tab.worktreeId) return { kind: "detached", tab, reason: "agent_worktree_mismatch" };
  return worktree ? { kind: "agent", tab, agent, worktree } : { kind: "agent", tab, agent };
}

/** Reconciles authoritative catalog state with stronger live RPC transport signals. */
export function resolveRootTabStatus(ready: boolean, streaming: boolean, catalogStatus?: AgentStatus): AgentStatus {
  if (!ready) return "disconnected";
  if (streaming) return "working";
  return catalogStatus ?? "idle";
}
