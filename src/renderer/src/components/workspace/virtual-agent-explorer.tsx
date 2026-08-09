import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { WorkspaceAgent, WorkspaceSnapshot, WorkspaceWorktree } from "../../../../shared/workspace";

export type VirtualAgentExplorerLoadState = "loading" | "ready" | "error";

export interface VirtualAgentExplorerProps {
  readonly snapshot: WorkspaceSnapshot;
  readonly currentSessionId: string;
  readonly activeAgentId: string;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
  readonly loadState: VirtualAgentExplorerLoadState;
  /** Accessible name for this navigation region. */
  readonly label?: string;
}

export type VirtualAgentExplorerRow =
  | { readonly kind: "worktree"; readonly key: string; readonly worktree: WorkspaceWorktree; readonly depth: number; readonly agentCount: number }
  | { readonly kind: "agent"; readonly key: string; readonly agent: WorkspaceAgent; readonly depth: number };

function safeParents<T extends { readonly id: string }>(
  items: readonly T[],
  candidateParent: (item: T) => string | undefined,
): ReadonlyMap<string, string | undefined> {
  const ids = new Set(items.map(({ id }) => id));
  const candidates = new Map(items.map((item) => {
    const parent = candidateParent(item);
    return [item.id, parent !== item.id && parent !== undefined && ids.has(parent) ? parent : undefined] as const;
  }));
  const result = new Map<string, string | undefined>();
  for (const item of items) {
    const parent = candidates.get(item.id);
    const visited = new Set([item.id]);
    let cursor = parent;
    let cyclic = false;
    while (cursor !== undefined) {
      if (visited.has(cursor)) { cyclic = true; break; }
      visited.add(cursor);
      cursor = candidates.get(cursor);
    }
    result.set(item.id, cyclic ? undefined : parent);
  }
  return result;
}

function childrenByParent<T extends { readonly id: string }>(
  items: readonly T[],
  parents: ReadonlyMap<string, string | undefined>,
): ReadonlyMap<string | undefined, readonly T[]> {
  const result = new Map<string | undefined, T[]>();
  for (const item of items) {
    const parent = parents.get(item.id);
    const siblings = result.get(parent) ?? [];
    siblings.push(item);
    result.set(parent, siblings);
  }
  return result;
}

/** Flattens worktree and agent ancestry into the stable visual order consumed by the virtualizer. */
export function flattenVirtualAgentExplorer(snapshot: WorkspaceSnapshot): readonly VirtualAgentExplorerRow[] {
  const worktreeParents = safeParents(snapshot.worktrees, ({ parentWorktreeId }) => parentWorktreeId);
  const worktreesByParent = childrenByParent(snapshot.worktrees, worktreeParents);
  const agentsByWorktree = new Map<string, WorkspaceAgent[]>();
  for (const agent of snapshot.agents) {
    const agents = agentsByWorktree.get(agent.worktreeId) ?? [];
    agents.push(agent);
    agentsByWorktree.set(agent.worktreeId, agents);
  }

  const rows: VirtualAgentExplorerRow[] = [];
  const appendAgents = (worktree: WorkspaceWorktree, worktreeDepth: number) => {
    const agents = agentsByWorktree.get(worktree.id) ?? [];
    const agentParents = safeParents(agents, ({ parentAgentId }) => parentAgentId);
    const agentsByParent = childrenByParent(agents, agentParents);
    const appendLevel = (parent: string | undefined, depth: number) => {
      for (const agent of agentsByParent.get(parent) ?? []) {
        rows.push({ kind: "agent", key: `agent:${agent.id}`, agent, depth: worktreeDepth + depth + 1 });
        appendLevel(agent.id, depth + 1);
      }
    };
    appendLevel(undefined, 0);
  };
  const appendWorktrees = (parent: string | undefined, depth: number) => {
    for (const worktree of worktreesByParent.get(parent) ?? []) {
      const agentCount = agentsByWorktree.get(worktree.id)?.length ?? 0;
      rows.push({ kind: "worktree", key: `worktree:${worktree.id}`, worktree, depth, agentCount });
      appendAgents(worktree, depth);
      appendWorktrees(worktree.id, depth + 1);
    }
  };
  appendWorktrees(undefined, 0);
  return rows;
}

function statusName(status: WorkspaceAgent["status"]): string {
  switch (status) {
    case "working": return "Working";
    case "waiting": return "Waiting";
    case "idle": return "Idle";
    case "completed": return "Completed";
    case "failed": return "Failed";
    case "cancelled": return "Cancelled";
    case "disconnected": return "Disconnected";
  }
}

function countName(count: number): string {
  return `${count} ${count === 1 ? "agent" : "agents"}`;
}

function emptyMessage(loadState: VirtualAgentExplorerLoadState): string {
  switch (loadState) {
    case "loading": return "Loading worktrees…";
    case "error": return "Unable to load worktrees. Check the workspace connection; Ernie will retry automatically.";
    case "ready": return "No worktrees found in this repository.";
  }
}

/** Virtualized worktree-first navigation for large agent and subagent catalogs. */
export function VirtualAgentExplorer({
  snapshot,
  currentSessionId,
  activeAgentId,
  onOpenAgent,
  loadState,
  label = "Worktrees and agents",
}: VirtualAgentExplorerProps) {
  const rows = useMemo(() => flattenVirtualAgentExplorer(snapshot), [snapshot]);
  const agentRowIndexes = useMemo(
    () => rows.flatMap((row, index) => row.kind === "agent" ? [index] : []),
    [rows],
  );
  const initialFocusIndex = rows.findIndex((row) => row.kind === "agent" && row.agent.id === activeAgentId);
  const [focusRowIndex, setFocusRowIndex] = useState(initialFocusIndex >= 0 ? initialFocusIndex : agentRowIndexes[0] ?? -1);
  const scrollElement = useRef<HTMLDivElement>(null);
  const pendingFocusIndex = useRef<number | undefined>(undefined);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement.current,
    estimateSize: (index) => rows[index]?.kind === "worktree" ? 36 : 44,
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 6,
    rangeExtractor: ({ startIndex, endIndex, overscan, count }) => {
      const first = Math.max(0, startIndex - overscan);
      const last = Math.min(count - 1, endIndex + overscan);
      const indexes = Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
      if (focusRowIndex >= 0 && !indexes.includes(focusRowIndex)) indexes.push(focusRowIndex);
      return indexes.sort((left, right) => left - right);
    },
  });
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const activeIndex = rows.findIndex((row) => row.kind === "agent" && row.agent.id === activeAgentId);
    setFocusRowIndex(activeIndex >= 0 ? activeIndex : agentRowIndexes[0] ?? -1);
  }, [activeAgentId, agentRowIndexes, rows]);

  useLayoutEffect(() => {
    const index = pendingFocusIndex.current;
    if (index === undefined) return;
    const button = scrollElement.current?.querySelector<HTMLButtonElement>(`button[data-explorer-index="${index}"]`);
    if (!button) return;
    pendingFocusIndex.current = undefined;
    button.focus();
  }, [virtualItems]);

  const focusAgentAt = useCallback((rowIndex: number) => {
    setFocusRowIndex(rowIndex);
    pendingFocusIndex.current = rowIndex;
    virtualizer.scrollToIndex(rowIndex, { align: "auto" });
    const focusWhenMounted = (attempts: number) => requestAnimationFrame(() => {
      const button = scrollElement.current?.querySelector<HTMLButtonElement>(`button[data-explorer-index="${rowIndex}"]`);
      if (button) {
        pendingFocusIndex.current = undefined;
        button.focus();
      } else if (attempts > 0 && pendingFocusIndex.current === rowIndex) focusWhenMounted(attempts - 1);
    });
    focusWhenMounted(12);
  }, [virtualizer]);

  const handleAgentKeyDown = (event: KeyboardEvent<HTMLButtonElement>, rowIndex: number) => {
    const current = agentRowIndexes.indexOf(rowIndex);
    if (current < 0) return;
    let target: number | undefined;
    if (event.key === "ArrowDown") target = agentRowIndexes[current + 1] ?? agentRowIndexes[0];
    else if (event.key === "ArrowUp") target = agentRowIndexes[current - 1] ?? agentRowIndexes.at(-1);
    else if (event.key === "Home") target = agentRowIndexes[0];
    else if (event.key === "End") target = agentRowIndexes.at(-1);
    if (target === undefined) return;
    event.preventDefault();
    focusAgentAt(target);
  };

  return <>
    <div className="rail-section-label worktree-heading">Worktrees</div>
    <nav aria-label={label} aria-busy={loadState === "loading" || undefined}>
      {rows.length === 0
        ? <div className="worktree-empty" role={loadState === "error" ? "alert" : "status"}>{emptyMessage(loadState)}</div>
        : <div
            ref={scrollElement}
            className="worktree-tree virtual-agent-explorer"
            role="list"
            aria-label="Virtualized worktree and session navigation"
            data-testid="virtual-agent-explorer"
            data-last-agent-index={agentRowIndexes.at(-1)}
            style={{ position: "relative" }}
          >
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}>
              {virtualItems.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                const position = { position: "absolute" as const, insetInlineStart: 0, top: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` };
                if (row.kind === "worktree") return <div
                  key={row.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="worktree-row"
                  role="listitem"
                  style={{ ...position, paddingInlineStart: `${7 + row.depth * 14}px` }}
                  title={`${row.worktree.label} — ${row.worktree.path}`}
                  aria-label={`${row.worktree.label}, ${countName(row.agentCount)}`}
                >
                  <span className="worktree-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="M7 4v11a4 4 0 0 0 4 4h6" /><path d="m14 16 3 3-3 3" /><circle cx="7" cy="4" r="2" /></svg></span>
                  <span title={row.worktree.label}>{row.worktree.label}</span>
                  <span className="worktree-count" aria-label={countName(row.agentCount)}>{row.agentCount}</span>
                </div>;
                const displayName = row.agent.sessionId === currentSessionId ? "Current agent" : row.agent.name;
                const status = statusName(row.agent.status);
                const summary = row.agent.summary || status;
                const worktreeLabel = snapshot.worktrees.find((worktree) => worktree.id === row.agent.worktreeId)?.label ?? "Unknown worktree";
                return <div role="listitem" key={row.key} ref={virtualizer.measureElement} data-index={virtualRow.index} style={position}>
                  <button
                    type="button"
                    aria-keyshortcuts="ArrowUp ArrowDown Home End"
                    tabIndex={virtualRow.index === focusRowIndex ? 0 : -1}
                    data-explorer-index={virtualRow.index}
                    aria-current={row.agent.id === activeAgentId ? "page" : undefined}
                    aria-label={`${displayName}, ${status}, ${worktreeLabel}, ${summary}`}
                    className={`agent-tree-row ${row.agent.id === activeAgentId ? "active" : ""}`}
                    style={{ paddingInlineStart: `${10 + row.depth * 17}px` }}
                    onClick={() => onOpenAgent(row.agent)}
                    onFocus={() => setFocusRowIndex(virtualRow.index)}
                    onKeyDown={(event) => handleAgentKeyDown(event, virtualRow.index)}
                    title={`${displayName} — ${summary}`}
                  >
                    <span className={`agent-state ${row.agent.status}`} aria-hidden="true" />
                    <span className="agent-tree-copy"><strong title={displayName}>{displayName}</strong><small title={summary}>{summary}</small></span>
                    {row.agent.runtimeKind === "subagent" && <span className="agent-kind">Subagent</span>}
                  </button>
                </div>;
              })}
            </div>
          </div>}
    </nav>
  </>;
}
