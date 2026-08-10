/** A model that the connected Prime Agent session can use. */
export interface PrimeAgentModel {
  readonly key: string;
  readonly id: string;
  readonly name: string;
  readonly provider: string;
}

/** A live top-level Prime Agent session that Ernie can control. */
export interface PrimeAgentSession {
  readonly activeSessionId: string;
  readonly cwd: string;
  readonly name: string;
  readonly model: PrimeAgentModel | null;
  readonly modifiedAt: string | null;
}

/** The current local workspace and the daemon sessions visible to Ernie. */
export interface PrimeAgentWorkspace {
  readonly currentCwd: string;
  readonly sessions: readonly PrimeAgentSession[];
}

/** Local Git branches and the checked-out branch for one workspace. */
export interface PrimeAgentGitBranches {
  readonly cwd: string;
  readonly current: string | null;
  readonly names: readonly string[];
}

/** The local Git branch change requested for one workspace. */
export interface PrimeAgentGitBranchSelection {
  readonly cwd: string;
  readonly name: string;
}

/** Stable failure categories returned across the Electron IPC boundary. */
export type PrimeAgentFailureCode =
  | 'invalid_request'
  | 'daemon_unavailable'
  | 'request_failed'
  | 'protocol_error';

/** A safe Prime Agent failure projection for the renderer. */
export interface PrimeAgentFailure {
  readonly code: PrimeAgentFailureCode;
  readonly message: string;
}

/** A serializable success or expected failure from a Prime Agent operation. */
export type PrimeAgentResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: PrimeAgentFailure }>;

/** The model change requested for one live Prime Agent session. */
export interface PrimeAgentModelSelection {
  readonly activeSessionId: string;
  readonly provider: string;
  readonly modelId: string;
}

/** The source that currently owns one session's RLM maximum depth. */
export type PrimeAgentRlmDepthSource =
  | 'default'
  | 'env'
  | 'global'
  | 'inherited'
  | 'chat';

/** The live RLM maximum-depth state for one Prime Agent session. */
export interface PrimeAgentRlmDepth {
  readonly maxDepth: number;
  readonly source: PrimeAgentRlmDepthSource;
}

/** The RLM maximum-depth change requested for one Prime Agent session. */
export interface PrimeAgentRlmDepthSelection {
  readonly activeSessionId: string;
  readonly maxDepth: number;
}

/** The daemon operations owned by Ernie's Electron main process. */
export interface PrimeAgentDaemon {
  readonly listWorkspace: () => Promise<PrimeAgentResult<PrimeAgentWorkspace>>;
  readonly listModels: (
    activeSessionId: unknown,
  ) => Promise<PrimeAgentResult<readonly PrimeAgentModel[]>>;
  readonly setModel: (
    selection: unknown,
  ) => Promise<PrimeAgentResult<PrimeAgentModel>>;
  readonly getRlmDepth: (
    activeSessionId: unknown,
  ) => Promise<PrimeAgentResult<PrimeAgentRlmDepth>>;
  readonly setRlmDepth: (
    selection: unknown,
  ) => Promise<PrimeAgentResult<PrimeAgentRlmDepth>>;
}
