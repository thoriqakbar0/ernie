import type { AgentSlashCommand } from "./commands";
import type { WorkspaceSnapshot } from "./workspace";
import type { DevServerSnapshot } from "./devServer";
import type { SessionTranscriptEvent, SessionTranscriptSnapshot } from "./sessionTranscript";
import type { RendererPerformanceSample } from "./performance";
import type { AgentModelOption, SpaceAgentEvent, SpaceRuntimeState, StartSpaceInput } from "./spaceRuntime";

export type ConnectionState = "starting" | "ready" | "failed" | "closed";
export type ExecutionTarget = "local" | "modal";

/** Renderer-safe lifecycle state for one built-in IPython execution. */
export type IPythonExecutionStatus = "running" | "succeeded" | "failed" | "aborted";

/** Structured IPython execution data captured at the RPC event boundary. */
export interface IPythonExecution {
  readonly executionTarget: ExecutionTarget | "unknown";
  readonly status: IPythonExecutionStatus;
  readonly code: string;
  readonly detail: string;
  /** Unix epoch milliseconds captured when the start event was observed. */
  readonly startedAt: number | null;
  /** Monotonic elapsed milliseconds when an execution has ended; otherwise null. */
  readonly durationMs: number | null;
}

export interface AgentState {
  readonly connection: ConnectionState;
  readonly detail: string;
  readonly executionTarget: ExecutionTarget;
  readonly switchingExecutionTo?: ExecutionTarget;
  readonly sessionId: string;
  readonly sessionName: string;
  readonly provider: string;
  readonly modelId: string;
  readonly modelName: string;
  readonly thinkingLevel: string;
  readonly isStreaming: boolean;
  readonly isCompacting: boolean;
  readonly messageCount: number;
  readonly queuedCount: number;
  readonly contextTokens: number;
  readonly contextWindow: number;
  readonly contextPercent: number;
  readonly totalTokens: number;
  readonly cost: string;
}

export type AgentCommand =
  | { readonly type: "prompt"; readonly message: string; readonly behavior?: "now" | "steer" | "followUp" }
  | { readonly type: "set_execution_target"; readonly target: ExecutionTarget }
  | { readonly type: "set_model"; readonly provider: string; readonly modelId: string }
  | { readonly type: "abort" }
  | { readonly type: "new_session" }
  | { readonly type: "compact" }
  | { readonly type: "cycle_model" }
  | { readonly type: "cycle_thinking_level" }
  | { readonly type: "refresh" };

export type AgentEvent =
  | { readonly kind: "connection"; readonly state: ConnectionState; readonly detail: string }
  | { readonly kind: "workspace"; readonly snapshot: WorkspaceSnapshot }
  | { readonly kind: "state"; readonly state: AgentState }
  | { readonly kind: "assistant_message"; readonly sequence: number; readonly phase: "start" | "end"; readonly messageId: string; readonly blocks: ReadonlyArray<{ readonly contentIndex: number; readonly text: string }> | null }
  | { readonly kind: "assistant_delta"; readonly sequence: number; readonly messageId: string; readonly contentIndex: number; readonly delta: string }
  | { readonly kind: "lifecycle"; readonly sequence: number; readonly type: string; readonly detail: unknown }
  | { readonly kind: "tool"; readonly sequence: number; readonly phase: "start" | "update" | "end"; readonly callId: string; readonly name: string; readonly isError: boolean; readonly detail: string; readonly ipython?: IPythonExecution }
  | { readonly kind: "delegation"; readonly sequence: number; readonly childId: string; readonly activeSessionId?: string; readonly name: string; readonly task: string; readonly status: "queued" | "running" | "done" | "error" | "cancelled"; readonly detail: string }
  | { readonly kind: "error"; readonly source: string; readonly message: string; readonly detail?: unknown }
  | { readonly kind: "raw"; readonly sequence: number; readonly event: unknown };

/** Workspace-only events kept separate from Space runtime streams. */
export type WorkspaceEvent = Extract<AgentEvent, { readonly kind: "workspace" }> | Extract<AgentEvent, { readonly kind: "error" }>;

export interface CommandResult {
  readonly ok: boolean;
  readonly cancelled?: boolean;
  readonly error?: string;
}

export type OpenProjectResult =
  | { readonly ok: true; readonly cancelled: true }
  | { readonly ok: true; readonly cancelled: false; readonly snapshot: WorkspaceSnapshot }
  | { readonly ok: false; readonly error: string };

export type ArchiveProjectResult =
  | { readonly ok: true; readonly snapshot: WorkspaceSnapshot }
  | { readonly ok: false; readonly error: string };

export interface ErnieApi {
  /** Get or lazily create the runtime authorized by this catalog Space. */
  getSpaceState(spaceId: string): Promise<SpaceRuntimeState>;
  getSpaceCommands(spaceId: string): Promise<readonly AgentSlashCommand[]>;
  getSpaceModels(spaceId: string): Promise<readonly AgentModelOption[]>;
  getSpaceRlmMaxDepth(spaceId: string): Promise<number>;
  startSpace(input: StartSpaceInput): Promise<CommandResult>;
  spaceCommand(spaceId: string, command: AgentCommand): Promise<CommandResult>;
  onSpaceEvent(listener: (event: SpaceAgentEvent) => void): () => void;
  onWorkspaceEvent(listener: (event: WorkspaceEvent) => void): () => void;
  getWorkspace(): Promise<WorkspaceSnapshot>;
  openProjectDirectory(): Promise<OpenProjectResult>;
  archiveProject(projectId: string): Promise<ArchiveProjectResult>;
  refreshDevServers(worktreeId: string): Promise<DevServerSnapshot>;
  openDevServer(worktreeId: string, port: number, url: string): Promise<CommandResult>;
  copyText(text: string): Promise<CommandResult>;
  /** Read a rate-limited CPU and working-set sample for this renderer only. */
  getRendererPerformance(): Promise<RendererPerformanceSample | null>;
  selectSessionTranscript(activeSessionId: string): Promise<SessionTranscriptSnapshot>;
  detachSessionTranscript(): Promise<void>;
  onSessionTranscriptEvent(listener: (event: SessionTranscriptEvent) => void): () => void;
  platform: string;
}
