import type { JsonValue } from '../json-value/index.js';

/** A model that the connected Prime Agent session can use. */
export interface PrimeAgentModel {
  readonly key: string;
  readonly id: string;
  readonly name: string;
  readonly provider: string;
}

/** Truthful activity states shown for one connected Prime Agent session. */
export type PrimeAgentSessionActivity =
  | 'working'
  | 'queued'
  | 'needs_input'
  | 'idle'
  | 'settled';

/** A live top-level Prime Agent session that Ernie can control. */
export interface PrimeAgentSession {
  readonly activeSessionId: string;
  readonly activity: PrimeAgentSessionActivity;
  readonly cwd: string;
  readonly name: string;
  readonly model: PrimeAgentModel | null;
  readonly modifiedAt: string | null;
  readonly sessionPath: string | null;
}

/** One authored text message projected from a focused Prime Agent session. */
export interface PrimeAgentChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

/** One chronologically placed item in Prime Agent's visible working transcript. */
export type PrimeAgentTranscriptItem =
  | Readonly<{
      id: string;
      kind: 'message';
      role: 'user' | 'assistant';
      text: string;
    }>
  | Readonly<{
      attachments: readonly PrimeAgentIpythonAttachment[];
      code: string;
      durationMs: number | null;
      id: string;
      kind: 'ipython';
      result: string | null;
      status: 'running' | 'starting' | 'ok' | 'error' | 'aborted';
      stderr: string | null;
      stdout: string | null;
      traceback: readonly string[];
    }>;

/** One media artifact returned by an IPython execution. */
export interface PrimeAgentIpythonAttachment {
  readonly data: string;
  readonly mimeType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp';
  readonly path: string | null;
}

/** One real spawned session reported by Prime Agent's RLM runtime. */
export interface PrimeAgentSpawnedSession {
  readonly activeSessionId: string | null;
  readonly activity: string | null;
  readonly durationMs: number | null;
  readonly error: string | null;
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly recap: string | null;
  readonly status: 'queued' | 'working' | 'done' | 'error' | 'cancelled';
}

/** Focused chat data loaded from one Prime Agent attach snapshot. */
export interface PrimeAgentSessionView {
  readonly activeSessionId: string;
  readonly isStreaming: boolean;
  readonly messages: readonly PrimeAgentChatMessage[];
  readonly rlmMaxDepth: number;
  readonly sessionName: string | null;
  readonly spawnedSessions: readonly PrimeAgentSpawnedSession[];
  readonly transcript: readonly PrimeAgentTranscriptItem[];
}

/** One normalized live-session change safe to send across Electron IPC. */
export type PrimeAgentSessionFeedItem =
  | Readonly<{
      kind: 'snapshot';
      view: PrimeAgentSessionView;
    }>
  | Readonly<{
      kind: 'conversation-replaced';
      isStreaming: boolean;
      messages: readonly PrimeAgentChatMessage[];
      transcript: readonly PrimeAgentTranscriptItem[];
    }>
  | Readonly<{
      kind: 'spawned-sessions-replaced';
      sessions: readonly PrimeAgentSpawnedSession[];
    }>
  | Readonly<{
      kind: 'session-name-changed';
      sessionName: string | null;
    }>
  | Readonly<{
      kind: 'connection-changed';
      status: 'live' | 'reconnecting';
    }>
  | Readonly<{
      kind: 'closed';
      failure: PrimeAgentFailure;
    }>;

/** One locally sequenced session-feed event owned by one renderer subscription. */
export interface PrimeAgentSessionFeedEnvelope {
  readonly activeSessionId: string;
  readonly item: PrimeAgentSessionFeedItem;
  readonly revision: number;
  readonly subscriptionId: string;
}

/** One renderer request to start a selected Prime Agent session feed. */
export interface PrimeAgentSessionFeedRequest {
  readonly activeSessionId: string;
  readonly subscriptionId: string;
}

/** A durable Prime Agent session that can be reopened in Ernie. */
export interface PrimeAgentSavedSession {
  readonly activity: Extract<PrimeAgentSessionActivity, 'needs_input' | 'idle' | 'settled'>;
  readonly cwd: string;
  readonly messageCount: number;
  readonly modifiedAt: string;
  readonly name: string;
  readonly path: string;
}

/** One Prime Agent skill available to the active Agent conversation. */
export interface PrimeAgentSkill {
  readonly command: string;
  readonly content: string;
  readonly description: string | null;
  readonly name: string;
}

/** The current local workspace and the daemon sessions visible to Ernie. */
export interface PrimeAgentWorkspace {
  readonly currentCwd: string;
  readonly sessions: readonly PrimeAgentSession[];
}

/** Truthful lifecycle states for Ernie's workspace connection. */
export type PrimeAgentWorkspaceConnection =
  | 'connecting'
  | 'ready'
  | 'reconnecting'
  | 'unavailable';

/** One daemon-owned workspace change safe to send across Electron IPC. */
export type PrimeAgentWorkspaceFeedItem =
  | Readonly<{
      kind: 'connection-changed';
      status: PrimeAgentWorkspaceConnection;
    }>
  | Readonly<{
      kind: 'workspace-replaced';
      workspace: PrimeAgentWorkspace;
    }>;

/** Configuration required before Prime Agent creates one new session. */
export interface PrimeAgentSessionCreation {
  readonly cwd: string;
  readonly rlmMaxDepth: number;
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

/** The local Git branch rename requested for one workspace. */
export interface PrimeAgentGitBranchRename {
  readonly cwd: string;
  readonly currentName: string;
  readonly newName: string;
}

/** A request to create or reuse one branch-backed Git worktree. */
export interface PrimeAgentGitWorktreeCreation {
  readonly cwd: string;
  readonly branchName: string;
}

/** A local Git worktree created or reused for one branch. */
export interface PrimeAgentGitWorktree {
  readonly cwd: string;
  readonly branchName: string;
}

/** Git repository identity for one repository root or linked worktree. */
export interface PrimeAgentGitWorkspace {
  readonly cwd: string;
  readonly repositoryCwd: string;
  readonly branchName: string | null;
}

/** Stable failure categories returned across the Electron IPC boundary. */
export type PrimeAgentFailureCode =
  | 'invalid_request'
  | 'daemon_unavailable'
  | 'request_failed'
  | 'outcome_uncertain'
  | 'unsupported_operation'
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

/** Process paths and workspace used to launch the shared Prime Agent daemon. */
export interface PrimeAgentDaemonConfiguration {
  readonly currentCwd: string;
  readonly daemonEntrypointPath: string;
  readonly executablePath: string;
  readonly sessionNameExtensionPath: string;
  readonly sessionDirectoryPath?: string;
  readonly socketPath?: string;
}

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

/** One task submitted to a connected Prime Agent session. */
export interface PrimeAgentTaskSubmission {
  readonly activeSessionId: string;
  readonly message: string;
}

/** Confirmation that Prime Agent accepted one task for execution. */
export interface PrimeAgentTaskReceipt {
  readonly accepted: true;
}

/** A continual-harness refinement requested for one connected session. */
export interface PrimeAgentRefinementRequest {
  readonly activeSessionId: string;
  readonly instructions: string | null;
}

/** Confirmation that Prime Agent completed one harness refinement. */
export interface PrimeAgentRefinementReceipt {
  readonly refined: true;
}

/** A real Prime Agent session-name change requested by Ernie. */
export type PrimeAgentSessionRename =
  | Readonly<{
      kind: 'live';
      activeSessionId: string;
      sessionPath: string | null;
      name: string;
    }>
  | Readonly<{
      kind: 'saved';
      sessionPath: string;
      name: string;
    }>;

/** Confirmation that Prime Agent persisted a session name. */
export interface PrimeAgentSessionRenameReceipt {
  readonly name: string;
}

/** The daemon operations owned by Ernie's Electron main process. */
export interface PrimeAgentDaemon {
  readonly listWorkspace: () => Effect.Effect<
    PrimeAgentResult<PrimeAgentWorkspace>
  >;
  readonly listModels: (
    activeSessionId: JsonValue,
  ) => Effect.Effect<PrimeAgentResult<readonly PrimeAgentModel[]>>;
  readonly listSkills: (
    activeSessionId: JsonValue,
  ) => Effect.Effect<PrimeAgentResult<readonly PrimeAgentSkill[]>>;
  readonly sessionFeed: (
    activeSessionId: JsonValue,
  ) => Stream.Stream<PrimeAgentSessionFeedItem>;
  readonly workspaceFeed: () => Stream.Stream<PrimeAgentWorkspaceFeedItem>;
  readonly createSession: (
    creation: JsonValue,
  ) => Effect.Effect<PrimeAgentResult<PrimeAgentSession>>;
  readonly listSavedSessions: () => Effect.Effect<
    PrimeAgentResult<readonly PrimeAgentSavedSession[]>
  >;
  readonly importSession: (
    sessionPath: JsonValue,
  ) => Effect.Effect<PrimeAgentResult<PrimeAgentSession>>;
  readonly renameSession: (
    rename: JsonValue,
  ) => Effect.Effect<PrimeAgentResult<PrimeAgentSessionRenameReceipt>>;
  readonly setModel: (
    selection: JsonValue,
  ) => Effect.Effect<PrimeAgentResult<PrimeAgentModel>>;
  readonly getRlmDepth: (
    activeSessionId: JsonValue,
  ) => Effect.Effect<PrimeAgentResult<PrimeAgentRlmDepth>>;
  readonly setRlmDepth: (
    selection: JsonValue,
  ) => Effect.Effect<PrimeAgentResult<PrimeAgentRlmDepth>>;
  readonly submitTask: (
    submission: JsonValue,
  ) => Effect.Effect<PrimeAgentResult<PrimeAgentTaskReceipt>>;
  readonly refineSession: (
    request: JsonValue,
  ) => Effect.Effect<PrimeAgentResult<PrimeAgentRefinementReceipt>>;
  readonly close: () => void;
}
import type { Effect, Stream } from 'effect';
