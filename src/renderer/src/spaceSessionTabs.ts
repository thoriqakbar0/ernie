/** One Space's open session views and local selection. */
export interface SpaceSessionTabs {
  readonly agentIds: readonly string[];
  readonly activeAgentId: string | undefined;
}

/** Session-tab state keyed by owning Space. Spaces never share tab selection. */
export type SpaceSessionTabsState = ReadonlyMap<string, SpaceSessionTabs>;

const EMPTY_SPACE_TABS: SpaceSessionTabs = { agentIds: [], activeAgentId: undefined };

/** Creates an empty collection of Space-local tab sets. */
export function emptySpaceSessionTabs(): SpaceSessionTabsState {
  return new Map();
}

/** Returns a Space's tabs, or an immutable empty view when it has none. */
export function tabsForSpace(state: SpaceSessionTabsState, spaceId: string | undefined): SpaceSessionTabs {
  return spaceId === undefined ? EMPTY_SPACE_TABS : state.get(spaceId) ?? EMPTY_SPACE_TABS;
}

/** Opens or focuses one agent session inside its owning Space. */
export function openSpaceSessionTab(state: SpaceSessionTabsState, spaceId: string, agentId: string): SpaceSessionTabsState {
  const current = tabsForSpace(state, spaceId);
  const agentIds = current.agentIds.includes(agentId) ? current.agentIds : [...current.agentIds, agentId];
  if (agentIds === current.agentIds && current.activeAgentId === agentId) return state;
  const next = new Map(state);
  next.set(spaceId, { agentIds, activeAgentId: agentId });
  return next;
}

/** Focuses an already-open session without allowing cross-Space selection. */
export function selectSpaceSessionTab(state: SpaceSessionTabsState, spaceId: string, agentId: string): SpaceSessionTabsState {
  const current = tabsForSpace(state, spaceId);
  if (!current.agentIds.includes(agentId) || current.activeAgentId === agentId) return state;
  const next = new Map(state);
  next.set(spaceId, { ...current, activeAgentId: agentId });
  return next;
}

/** Closes only a local view and deterministically focuses its nearest neighbor. */
export function closeSpaceSessionTab(state: SpaceSessionTabsState, spaceId: string, agentId: string): SpaceSessionTabsState {
  const current = tabsForSpace(state, spaceId);
  const closingIndex = current.agentIds.indexOf(agentId);
  if (closingIndex < 0) return state;
  const agentIds = current.agentIds.filter((id) => id !== agentId);
  const activeAgentId = current.activeAgentId === agentId
    ? agentIds[Math.min(closingIndex, agentIds.length - 1)]
    : current.activeAgentId;
  const next = new Map(state);
  next.set(spaceId, { agentIds, activeAgentId });
  return next;
}

/** Replaces provisional live-RPC identity in place without merging different Spaces' tab sets. */
export function reconcileProvisionalSessionTabs(state: SpaceSessionTabsState, stableAgentId: string): SpaceSessionTabsState {
  let changed = false;
  const next = new Map<string, SpaceSessionTabs>();
  for (const [spaceId, tabs] of state) {
    let entryChanged = false;
    const agentIds: string[] = [];
    const seenAgentIds = new Set<string>();
    for (const id of tabs.agentIds) {
      const reconciled = id.startsWith("rpc:") ? stableAgentId : id;
      entryChanged ||= reconciled !== id;
      if (seenAgentIds.has(reconciled)) continue;
      seenAgentIds.add(reconciled);
      agentIds.push(reconciled);
    }
    const activeAgentId = tabs.activeAgentId?.startsWith("rpc:") ? stableAgentId : tabs.activeAgentId;
    entryChanged ||= activeAgentId !== tabs.activeAgentId;
    changed ||= entryChanged;
    next.set(spaceId, entryChanged ? { agentIds, activeAgentId } : tabs);
  }
  return changed ? next : state;
}
