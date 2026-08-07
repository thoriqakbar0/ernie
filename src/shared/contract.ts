import type { AgentSlashCommand } from "./commands";
import type { WorkspaceSnapshot } from "./workspace";

export type ConnectionState = "starting" | "ready" | "failed" | "closed";
export type ExecutionTarget = "local" | "modal";

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
  | { readonly kind: "tool"; readonly sequence: number; readonly phase: "start" | "update" | "end"; readonly callId: string; readonly name: string; readonly isError: boolean; readonly detail: string }
  | { readonly kind: "delegation"; readonly sequence: number; readonly childId: string; readonly activeSessionId?: string; readonly name: string; readonly task: string; readonly status: "queued" | "running" | "done" | "error" | "cancelled"; readonly detail: string }
  | { readonly kind: "error"; readonly source: string; readonly message: string; readonly detail?: unknown }
  | { readonly kind: "raw"; readonly sequence: number; readonly event: unknown };

export interface CommandResult {
  readonly ok: boolean;
  readonly cancelled?: boolean;
  readonly error?: string;
}

export interface ErnieApi {
  getState(): Promise<AgentState>;
  getCommands(): Promise<readonly AgentSlashCommand[]>;
  getWorkspace(): Promise<WorkspaceSnapshot>;
  command(command: AgentCommand): Promise<CommandResult>;
  onAgentEvent(listener: (event: AgentEvent) => void): () => void;
  platform: string;
}
