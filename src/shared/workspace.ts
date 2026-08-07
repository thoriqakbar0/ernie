/** Renderer-safe workspace projections shared across Electron boundaries. */

/** Explicit UI state for a cataloged Prime Agent session. */
export type AgentStatus = "working" | "waiting" | "idle" | "completed" | "failed" | "cancelled" | "disconnected";

/** A Prime Agent session projected without daemon records or session-file paths. */
export interface WorkspaceAgent {
  /** Active daemon identifier when available, otherwise the persisted session identifier. */
  readonly id: string;
  /** Current daemon identifier, when the session is resident. */
  readonly activeSessionId?: string;
  /** Stable persisted session identifier. */
  readonly sessionId: string;
  /** Identifier of the worktree containing the session. */
  readonly worktreeId: string;
  /** Identifier of the parent agent for an RLM child. */
  readonly parentAgentId?: string;
  /** RLM child handle, when this is a subagent. */
  readonly childId?: string;
  /** Human-readable session name. */
  readonly name: string;
  /** One-line background summary supplied by Prime Agent. */
  readonly summary: string;
  /** Explicit renderer state derived from daemon lifecycle and activity. */
  readonly status: AgentStatus;
  /** Whether this session is a root or delegated subagent. */
  readonly runtimeKind: "root" | "subagent";
  /** ISO timestamp for the latest recorded activity. */
  readonly lastActivityAt?: string;
  /** Short child response preview when the daemon supplies one. */
  readonly answerPreview?: string;
}

/** A Git checkout belonging to the repository. */
export interface WorkspaceWorktree {
  /** Stable worktree identifier; its normalized absolute path. */
  readonly id: string;
  /** Absolute checkout path. */
  readonly path: string;
  /** Branch-oriented display label, falling back to the directory name. */
  readonly label: string;
  /** Owning worktree inferred from cross-worktree parent-agent relationships. */
  readonly parentWorktreeId?: string;
}

/** One immutable, renderer-safe view of repository worktrees and sessions. */
export interface WorkspaceSnapshot {
  /** Git-authoritative worktrees, including worktrees without sessions. */
  readonly worktrees: readonly WorkspaceWorktree[];
  /** Repository sessions mapped to one of the listed worktrees. */
  readonly agents: readonly WorkspaceAgent[];
  /** ISO timestamp at which both external reads completed. */
  readonly updatedAt: string;
}

/** Notification published after a complete snapshot replaces the prior one. */
export interface WorkspaceCatalogEvent {
  readonly kind: "snapshot";
  readonly snapshot: WorkspaceSnapshot;
}
