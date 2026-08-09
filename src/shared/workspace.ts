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

/** A user-opened directory that owns one focused project space. */
export interface WorkspaceProject {
  /** Stable project identifier; its normalized absolute path. */
  readonly id: string;
  /** Absolute directory selected by the user. */
  readonly path: string;
  /** Directory-oriented display label. */
  readonly label: string;
  /** Active worktrees presented inside this project. */
  readonly worktreeIds: readonly string[];
}

/** A Git checkout belonging to the repository. */
export interface WorkspaceWorktree {
  /** Stable worktree identifier; its normalized absolute path. */
  readonly id: string;
  /** Absolute checkout path, retained after a managed checkout is removed. */
  readonly path: string;
  /** Branch-oriented display label, falling back to the directory name. */
  readonly label: string;
  /** Local branch checked out here, or null for a detached checkout. */
  readonly branch?: string | null;
  /** Whether Ernie created and owns the checkout path. */
  readonly managed?: boolean;
  /** Whether the checkout currently exists in Git's authoritative worktree list. */
  readonly checkoutPresent?: boolean;
  /** Whether Git currently locks the checkout against removal. */
  readonly locked?: boolean;
  /** Owning worktree inferred from cross-worktree parent-agent relationships. */
  readonly parentWorktreeId?: string;
}

/** A settled checkout retained outside active runtime authorization. */
export interface WorkspaceSettledWorktree extends WorkspaceWorktree {
  readonly branch: string | null;
  readonly managed: boolean;
  readonly checkoutPresent: boolean;
  readonly locked: boolean;
  /** Catalog project that owns this settled checkout. */
  readonly projectId: string;
  /** ISO timestamp recorded when the checkout most recently entered Settled. */
  readonly settledAt: string;
}

/** One immutable, renderer-safe view of repository worktrees and sessions. */
export interface WorkspaceSnapshot {
  /** User-opened directories in stable display order. */
  readonly projects: readonly WorkspaceProject[];
  /** Active, catalog-authorized worktrees, including worktrees without sessions. */
  readonly worktrees: readonly WorkspaceWorktree[];
  /** Settled worktrees retained without runtime authorization. */
  readonly settledWorktrees?: readonly WorkspaceSettledWorktree[];
  /** Repository sessions mapped to one of the active worktrees. */
  readonly agents: readonly WorkspaceAgent[];
  /** ISO timestamp at which both external reads completed. */
  readonly updatedAt: string;
}

/** Read-only catalog notifications projected without command or diagnostic detail. */
export type WorkspaceCatalogEvent =
  | { readonly kind: "snapshot"; readonly snapshot: WorkspaceSnapshot }
  | { readonly kind: "error"; readonly message: string };
