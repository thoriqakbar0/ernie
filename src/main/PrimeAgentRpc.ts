import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { statSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import type { AgentSlashCommand } from "../shared/commands";
import type { AgentCommand, AgentEvent, AgentState, ExecutionTarget, IPythonExecution, IPythonExecutionStatus } from "../shared/contract";
import type { AgentThinkingLevel } from "../shared/spaceRuntime";

const MAX_LINE_BYTES = 32 * 1024 * 1024;
const MAX_STDERR_BYTES = 128 * 1024;
const REQUEST_TIMEOUT = "30 seconds";
const STARTUP_TIMEOUT = "45 seconds";
const EXECUTION_TARGET_TIMEOUT = "10 minutes";

function signalProcessTree(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  if (child.pid === undefined) throw new Error("Prime Agent child has no process ID");
  try {
    if (process.platform === "win32") {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
      return;
    }
    process.kill(-child.pid, signal);
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ESRCH")) throw cause;
  }
}

export class PrimeAgentRpcError extends Schema.TaggedErrorClass<PrimeAgentRpcError>()(
  "PrimeAgentRpcError",
  { operation: Schema.String, message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}

const RpcEnvelope = Schema.Struct({ type: Schema.String });
const RpcResponse = Schema.Struct({
  type: Schema.Literal("response"),
  id: Schema.String,
  command: Schema.String,
  success: Schema.Boolean,
  data: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(Schema.Unknown),
});
type RpcResponse = typeof RpcResponse.Type;

const RpcThinkingLevelMap = Schema.Struct({
  off: Schema.optionalKey(Schema.NullOr(Schema.String)),
  minimal: Schema.optionalKey(Schema.NullOr(Schema.String)),
  low: Schema.optionalKey(Schema.NullOr(Schema.String)),
  medium: Schema.optionalKey(Schema.NullOr(Schema.String)),
  high: Schema.optionalKey(Schema.NullOr(Schema.String)),
  xhigh: Schema.optionalKey(Schema.NullOr(Schema.String)),
  max: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
const RpcModel = Schema.Struct({
  provider: Schema.String,
  id: Schema.String,
  name: Schema.optionalKey(Schema.String),
  reasoning: Schema.Boolean,
  thinkingLevelMap: Schema.optionalKey(RpcThinkingLevelMap),
});
const RpcAvailableModelsResponse = Schema.Struct({ models: Schema.Array(RpcModel) });
const RpcRlmMaxDepthStatus = Schema.Struct({
  maxDepth: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  source: Schema.Literals(["default", "env", "global", "inherited", "chat"]),
});

const RpcSlashCommandResponse = Schema.Struct({
  commands: Schema.Array(Schema.Struct({
    name: Schema.String,
    description: Schema.optionalKey(Schema.String),
    source: Schema.Literals(["extension", "prompt", "skill"]),
  })),
});

/** Process and project paths used to create one isolated Prime Agent RPC instance. */
export interface Options {
  readonly nodePath: string;
  readonly cliPath: string;
  readonly projectPath: string;
  readonly remoteExtensionPath: string;
  readonly remoteUvPath?: string;
  readonly extraArgs?: readonly string[];
  readonly environment?: Readonly<Record<string, string>>;
}

/** The stable model identity and presentation fields exposed by the RPC model catalog. */
export interface PrimeAgentModel {
  readonly provider: string;
  readonly id: string;
  readonly name: string;
  readonly thinkingLevels: readonly AgentThinkingLevel[];
}

/** Provider-qualified identity used to select one model without catalog ambiguity. */
export interface PrimeAgentModelIdentity {
  readonly provider: string;
  readonly id: string;
}

/** Effective recursive-agent depth and the configuration source that selected it. */
export interface RlmMaxDepthStatus {
  readonly maxDepth: number;
  readonly source: "default" | "env" | "global" | "inherited" | "chat";
}

/** Configuration applied, in order, before the first prompt is admitted. */
export interface ConfigureFirstPrompt {
  readonly message: string;
  readonly behavior?: "steer" | "followUp" | "now";
  readonly model: PrimeAgentModelIdentity;
  readonly thinkingLevel: AgentThinkingLevel;
}

/** A scope-owned, single-process Prime Agent RPC adapter instance. */
export interface PrimeAgentRpcInstance {
  readonly start: Effect.Effect<void, PrimeAgentRpcError>;
  readonly stop: Effect.Effect<void, PrimeAgentRpcError>;
  readonly state: Effect.Effect<AgentState>;
  readonly events: Stream.Stream<AgentEvent>;
  readonly availableCommands: Effect.Effect<readonly AgentSlashCommand[], PrimeAgentRpcError>;
  readonly availableModels: Effect.Effect<readonly PrimeAgentModel[], PrimeAgentRpcError>;
  readonly currentModel: Effect.Effect<PrimeAgentModel, PrimeAgentRpcError>;
  readonly setModel: (model: PrimeAgentModelIdentity) => Effect.Effect<PrimeAgentModel, PrimeAgentRpcError>;
  readonly getRlmMaxDepthStatus: Effect.Effect<RlmMaxDepthStatus, PrimeAgentRpcError>;
  readonly setRlmMaxDepth: (maxDepth: number) => Effect.Effect<RlmMaxDepthStatus, PrimeAgentRpcError>;
  readonly configureThenPrompt: (configuration: ConfigureFirstPrompt) => Effect.Effect<void, PrimeAgentRpcError>;
  readonly command: (command: AgentCommand) => Effect.Effect<{ readonly cancelled?: boolean }, PrimeAgentRpcError>;
}

interface PendingRequest {
  readonly command: string;
  readonly deferred: Deferred.Deferred<unknown, PrimeAgentRpcError>;
}

type ProcessMessage =
  | { readonly _tag: "Chunk"; readonly chunk: Buffer }
  | { readonly _tag: "End" };

interface FramingState { readonly carry: Buffer }
interface FramingResult { readonly state: FramingState; readonly records: readonly Buffer[]; readonly fault: string | null }

const initialState = (): AgentState => ({
  connection: "starting", detail: "Launching Prime Agent RPC", executionTarget: "local", sessionId: "", sessionName: "",
  provider: "", modelId: "", modelName: "Discovering model", thinkingLevel: "", isStreaming: false,
  isCompacting: false, messageCount: 0, queuedCount: 0, contextTokens: 0, contextWindow: 0,
  contextPercent: 0, totalTokens: 0, cost: "$0.0000",
});

async function readExecutionTarget(projectPath: string, environment: Readonly<Record<string, string>>): Promise<ExecutionTarget> {
  const agentDirectory = environment["PRIME_AGENT_DIR"] ?? process.env["PRIME_AGENT_DIR"] ?? join(homedir(), ".prime", "agent");
  try {
    const decoded: unknown = JSON.parse(await readFile(join(agentDirectory, "remote.json"), "utf8"));
    const root = asRecord(decoded);
    if (root["version"] !== 1) return "local";
    const runtime = asRecord(asRecord(root["projects"])[projectPath]);
    return runtime["provider"] === "modal" && (runtime["active"] === undefined || runtime["active"] === true) && typeof runtime["runtimeId"] === "string"
      ? "modal"
      : "local";
  } catch {
    return "local";
  }
}

function frameChunk(state: FramingState, chunk: Buffer): FramingResult {
  const combined = state.carry.length === 0 ? chunk : Buffer.concat([state.carry, chunk]);
  if (combined.length > MAX_LINE_BYTES && !combined.includes(0x0a)) {
    return { state: { carry: Buffer.alloc(0) }, records: [], fault: `RPC record exceeds ${MAX_LINE_BYTES} bytes` };
  }
  const records: Buffer[] = [];
  let offset = 0;
  while (offset < combined.length) {
    const newline = combined.indexOf(0x0a, offset);
    if (newline < 0) break;
    let record = combined.subarray(offset, newline);
    if (record.length > MAX_LINE_BYTES) return { state: { carry: Buffer.alloc(0) }, records, fault: `RPC record exceeds ${MAX_LINE_BYTES} bytes` };
    if (record.at(-1) === 0x0d) record = record.subarray(0, -1);
    if (record.length > 0) records.push(record);
    offset = newline + 1;
  }
  const carry = Buffer.from(combined.subarray(offset));
  if (carry.length > MAX_LINE_BYTES) return { state: { carry: Buffer.alloc(0) }, records, fault: `RPC record exceeds ${MAX_LINE_BYTES} bytes` };
  return { state: { carry }, records, fault: null };
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null ? value as Readonly<Record<string, unknown>> : {};
}
const string = (value: unknown): string => typeof value === "string" ? value : "";
const integer = (value: unknown): number => typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
const nonNegativeInteger = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const finite = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : 0;

function assistantTextBlocks(message: unknown): ReadonlyArray<{ readonly contentIndex: number; readonly text: string }> {
  const content = asRecord(message)["content"];
  if (!Array.isArray(content)) return [];
  return content.flatMap((block, contentIndex) => {
    const record = asRecord(block);
    return record["type"] === "text" && typeof record["text"] === "string"
      ? [{ contentIndex, text: record["text"] }]
      : [];
  });
}

function toolDetail(payload: unknown): string {
  const record = asRecord(payload);
  for (const key of ["command", "code", "path", "file_path", "query", "description", "url", "prompt"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value.slice(0, 4_000);
  }
  try { return JSON.stringify(payload).slice(0, 8_000); } catch { return ""; }
}

function textContent(payload: unknown): string {
  const content = asRecord(payload)["content"];
  if (!Array.isArray(content)) return "";
  return content.flatMap((block) => {
    const record = asRecord(block);
    return record["type"] === "text" && typeof record["text"] === "string" ? [record["text"]] : [];
  }).join("\n").slice(0, 8_000);
}

function ipythonStatus(phase: "start" | "update" | "end", payload: unknown, isError: boolean): IPythonExecutionStatus {
  if (phase !== "end") return "running";
  const status = string(asRecord(asRecord(payload)["details"])["status"]);
  if (status === "aborted") return "aborted";
  return isError || status === "error" ? "failed" : "succeeded";
}

/** Returns true only for Prime Agent's built-in IPython tool identity. */
export function isIPythonToolName(name: string): boolean {
  return name === "ipython";
}

interface ActiveIPythonExecution {
  readonly executionTarget: ExecutionTarget;
  readonly code: string;
  readonly startedAt: number;
  readonly monotonicStartedAt: number;
  readonly detail: string;
}

function ipythonDetail(payload: unknown): string {
  const content = textContent(payload);
  if (content) return content;
  const details = asRecord(asRecord(payload)["details"]);
  for (const key of ["stderr", "stdout", "result", "errorEname"]) {
    const value = details[key];
    if (typeof value === "string" && value.length > 0) return value.slice(0, 8_000);
  }
  return "";
}

export class PrimeAgentRpc extends Context.Service<PrimeAgentRpc, PrimeAgentRpcInstance>()("@ernie/main/PrimeAgentRpc") {}

export const make = (options: Options) => Effect.gen(function* () {
  const state = yield* Ref.make(initialState());
  const child = yield* Ref.make<Option.Option<ChildProcessWithoutNullStreams>>(Option.none());
  const processExit = yield* Ref.make<Option.Option<Deferred.Deferred<void>>>(Option.none());
  const pending = yield* Ref.make<ReadonlyMap<string, PendingRequest>>(new Map());
  const requestSequence = yield* Ref.make(0);
  const eventSequence = yield* Ref.make(0);
  const assistantMessageSequence = yield* Ref.make(0);
  const activeAssistantMessage = yield* Ref.make<Option.Option<string>>(Option.none());
  const stderr = yield* Ref.make(Buffer.alloc(0));
  const messages = yield* Queue.bounded<ProcessMessage>(64);
  const framing = yield* Ref.make<FramingState>({ carry: Buffer.alloc(0) });
  const events = yield* PubSub.unbounded<AgentEvent>();
  const executionTargetSwitch = yield* Ref.make<Option.Option<{ readonly target: ExecutionTarget; readonly deferred: Deferred.Deferred<void, PrimeAgentRpcError> }>>(Option.none());
  const activeIPythonExecutions = yield* Ref.make<ReadonlyMap<string, ActiveIPythonExecution>>(new Map());
  const activeToolNames = yield* Ref.make<ReadonlyMap<string, string>>(new Map());
  const operationLock = yield* Queue.bounded<void>(1);
  yield* Queue.offer(operationLock, undefined);

  const exclusively = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.acquireUseRelease(Queue.take(operationLock), () => effect, () => Queue.offer(operationLock, undefined));

  const publish = (event: AgentEvent) => PubSub.publish(events, event).pipe(Effect.asVoid);
  const snapshot = Ref.get(state).pipe(Effect.map((value) => ({ ...value })));

  const setConnection = Effect.fn("PrimeAgentRpc.setConnection")(function* (connection: AgentState["connection"], detail: string) {
    const next = yield* Ref.updateAndGet(state, (current) => ({ ...current, connection, detail }));
    yield* publish({ kind: "connection", state: connection, detail });
    yield* publish({ kind: "state", state: { ...next } });
  });

  const rpcError = (operation: string, message: string, cause?: unknown) => new PrimeAgentRpcError({ operation, message, ...(cause === undefined ? {} : { cause }) });

  const publishState = Effect.fn("PrimeAgentRpc.publishState")(function* (next: AgentState) {
    yield* publish({ kind: "state", state: { ...next } });
  });

  const clearExecutionTargetSwitch = Effect.fn("PrimeAgentRpc.clearExecutionTargetSwitch")(function* () {
    yield* Ref.set(executionTargetSwitch, Option.none());
    const next = yield* Ref.updateAndGet(state, (current) => {
      const { switchingExecutionTo: _, ...rest } = current;
      return rest;
    });
    yield* publishState(next);
  });

  const failAllPending = Effect.fn("PrimeAgentRpc.failAllPending")(function* (error: PrimeAgentRpcError) {
    const requests = yield* Ref.getAndSet(pending, new Map());
    yield* Effect.forEach(requests.values(), (request) => Deferred.fail(request.deferred, error), { discard: true });
  });

  const failExecutionTargetSwitch = Effect.fn("PrimeAgentRpc.failExecutionTargetSwitch")(function* (error: PrimeAgentRpcError) {
    const activeSwitch = yield* Ref.get(executionTargetSwitch);
    if (Option.isSome(activeSwitch)) yield* Deferred.fail(activeSwitch.value.deferred, error);
  });

  const write = Effect.fn("PrimeAgentRpc.write")(function* (record: string) {
    const current = yield* Ref.get(child);
    if (Option.isNone(current) || current.value.stdin.destroyed) return yield* rpcError("write", "Prime Agent RPC is not connected");
    yield* Effect.callback<void, PrimeAgentRpcError>((resume) => {
      const stdin = current.value.stdin;
      const onError = (cause: Error) => { cleanup(); resume(Effect.fail(rpcError("write", cause.message, cause))); };
      const onDrain = () => { cleanup(); resume(Effect.void); };
      const cleanup = () => { stdin.off("error", onError); stdin.off("drain", onDrain); };
      stdin.once("error", onError);
      if (stdin.write(record, "utf8")) { cleanup(); resume(Effect.void); }
      else stdin.once("drain", onDrain);
      return Effect.sync(cleanup);
    });
  });

  const request = Effect.fn("PrimeAgentRpc.request")(function* (command: string, payload: Readonly<Record<string, unknown>>) {
    const sequence = yield* Ref.updateAndGet(requestSequence, (value) => value + 1);
    const id = `ernie-${sequence}`;
    const deferred = yield* Deferred.make<unknown, PrimeAgentRpcError>();
    yield* Ref.update(pending, (requests) => new Map(requests).set(id, { command, deferred }));
    yield* write(`${JSON.stringify({ id, type: command, ...payload })}\n`).pipe(
      Effect.tapError(() => Ref.update(pending, (requests) => { const next = new Map(requests); next.delete(id); return next; })),
    );
    const timeout = Effect.sleep(REQUEST_TIMEOUT).pipe(Effect.andThen(Effect.fail(rpcError(command, `${command} timed out`))));
    return yield* Deferred.await(deferred).pipe(
      Effect.raceFirst(timeout),
      Effect.ensuring(Ref.update(pending, (requests) => { const next = new Map(requests); next.delete(id); return next; })),
    );
  });

  const applyState = Effect.fn("PrimeAgentRpc.applyState")(function* (value: unknown) {
    const data = asRecord(value); const model = asRecord(data["model"]); const actions = asRecord(data["sessionActions"]);
    const next = yield* Ref.updateAndGet(state, (current) => ({
      ...current,
      sessionId: string(data["sessionId"]), sessionName: string(data["sessionName"]),
      provider: string(model["provider"]), modelId: string(model["id"]), modelName: string(model["name"]) || string(model["id"]) || "Unknown model",
      thinkingLevel: string(data["thinkingLevel"]), isStreaming: data["isStreaming"] === true,
      isCompacting: data["isCompacting"] === true, messageCount: integer(data["messageCount"]), queuedCount: integer(actions["queuedCount"]),
    }));
    yield* publish({ kind: "state", state: { ...next } });
  });

  const applyStats = Effect.fn("PrimeAgentRpc.applyStats")(function* (value: unknown) {
    const data = asRecord(value); const context = asRecord(data["contextUsage"]); const tokens = asRecord(data["tokens"]); const cost = finite(data["cost"]);
    const next = yield* Ref.updateAndGet(state, (current) => ({
      ...current, contextTokens: integer(context["tokens"]), contextWindow: integer(context["contextWindow"]),
      contextPercent: Math.max(0, Math.min(100, Math.round(finite(context["percent"])))), totalTokens: integer(tokens["total"]), cost: `$${cost.toFixed(4)}`,
    }));
    yield* publish({ kind: "state", state: { ...next } });
  });

  const takePending = (id: string) => Ref.modify(pending, (requests) => {
    const request = requests.get(id); const next = new Map(requests); next.delete(id);
    return [Option.fromNullishOr(request), next] as const;
  });

  const handleResponse = Effect.fn("PrimeAgentRpc.handleResponse")(function* (response: RpcResponse) {
    const found = yield* takePending(response.id);
    if (Option.isNone(found)) { yield* publish({ kind: "raw", sequence: yield* Ref.get(eventSequence), event: response }); return; }
    const request = found.value;
    if (response.command !== request.command) {
      yield* Deferred.fail(request.deferred, rpcError(response.command, `Expected ${request.command}, received ${response.command}`)); return;
    }
    if (!response.success) {
      const error = asRecord(response.error);
      const message = typeof response.error === "string" ? response.error : string(error["message"]);
      yield* Deferred.fail(request.deferred, rpcError(response.command, message || `${response.command} failed`, response.error)); return;
    }
    if (response.command === "get_state") yield* applyState(response.data);
    if (response.command === "get_session_stats") yield* applyStats(response.data);
    yield* Deferred.succeed(request.deferred, response.data);
  });

  const refresh = Effect.gen(function* () {
    yield* request("get_state", {}); yield* request("get_session_stats", {});
  }).pipe(Effect.asVoid);

  const startAssistantMessage = Effect.fn("PrimeAgentRpc.startAssistantMessage")(function* (sequence: number) {
    const active = yield* Ref.get(activeAssistantMessage);
    if (Option.isSome(active)) {
      yield* publish({ kind: "error", source: "protocol", message: "Assistant message started before the previous message ended" });
      yield* publish({ kind: "assistant_message", sequence, phase: "end", messageId: active.value, blocks: null });
    }
    const ordinal = yield* Ref.updateAndGet(assistantMessageSequence, (value) => value + 1);
    const messageId = `m:${ordinal}`;
    yield* Ref.set(activeAssistantMessage, Option.some(messageId));
    yield* publish({ kind: "assistant_message", sequence, phase: "start", messageId, blocks: null });
    return messageId;
  });

  const activeOrSynthesizedAssistantMessage = Effect.fn("PrimeAgentRpc.activeOrSynthesizedAssistantMessage")(function* (sequence: number) {
    const active = yield* Ref.get(activeAssistantMessage);
    if (Option.isSome(active)) return active.value;
    yield* publish({ kind: "error", source: "protocol", message: "Assistant update arrived without an active message" });
    return yield* startAssistantMessage(sequence);
  });

  const closeActiveAssistantMessage = Effect.fn("PrimeAgentRpc.closeActiveAssistantMessage")(function* (sequence: number) {
    const active = yield* Ref.get(activeAssistantMessage);
    if (Option.isNone(active)) return;
    yield* publish({ kind: "assistant_message", sequence, phase: "end", messageId: active.value, blocks: null });
    yield* Ref.set(activeAssistantMessage, Option.none());
  });

  const handleEvent = Effect.fn("PrimeAgentRpc.handleEvent")(function* (event: Readonly<Record<string, unknown>>) {
    const sequence = yield* Ref.get(eventSequence); const type = string(event["type"]);
    if (type === "message_start" && string(asRecord(event["message"])["role"]) === "assistant") {
      yield* startAssistantMessage(sequence);
      return;
    }
    if (type === "message_update") {
      const delta = asRecord(event["assistantMessageEvent"]);
      if (delta["type"] === "text_delta") {
        const contentIndex = nonNegativeInteger(delta["contentIndex"]);
        if (contentIndex === null) {
          yield* publish({ kind: "error", source: "protocol", message: "Assistant text delta has an invalid content index", detail: delta });
          return;
        }
        const messageId = yield* activeOrSynthesizedAssistantMessage(sequence);
        yield* publish({ kind: "assistant_delta", sequence, messageId, contentIndex, delta: string(delta["delta"]) });
      } else if (delta["type"] === "error") {
        yield* publish({ kind: "error", source: "assistant", message: string(asRecord(delta["error"])["message"]) || string(delta["reason"]) || "Assistant stream error", detail: delta });
      } else {
        yield* publish({ kind: "lifecycle", sequence, type: `message_${string(delta["type"]) || "update"}`, detail: delta });
      }
      return;
    }
    if (type === "message_end" && string(asRecord(event["message"])["role"]) === "assistant") {
      const messageId = yield* activeOrSynthesizedAssistantMessage(sequence);
      yield* publish({ kind: "assistant_message", sequence, phase: "end", messageId, blocks: assistantTextBlocks(event["message"]) });
      yield* Ref.set(activeAssistantMessage, Option.none());
      return;
    }
    if (type === "rlm_child_update") {
      const childUpdate = asRecord(event["child"]);
      const childId = string(childUpdate["id"]);
      const rawStatus = string(childUpdate["status"]);
      const status = rawStatus === "queued" || rawStatus === "running" || rawStatus === "done" || rawStatus === "error" || rawStatus === "cancelled" ? rawStatus : "running";
      if (!childId) {
        yield* publish({ kind: "error", source: "protocol", message: "Subagent update is missing its child identity", detail: event });
        return;
      }
      const activeSessionId = string(childUpdate["activeSessionId"]);
      const task = string(childUpdate["label"]) || string(childUpdate["task"]);
      const detail = string(childUpdate["answerPreview"]) || string(childUpdate["recap"]) || string(childUpdate["error"]);
      yield* publish({
        kind: "delegation", sequence, childId,
        ...(activeSessionId ? { activeSessionId } : {}),
        name: string(childUpdate["sessionName"]) || task || "Subagent",
        task, status, detail,
      });
      return;
    }
    if (type === "tool_execution_start" || type === "tool_execution_update" || type === "tool_execution_end") {
      const phase = type.endsWith("start") ? "start" as const : type.endsWith("update") ? "update" as const : "end" as const;
      const payload = phase === "start" ? event["args"] : phase === "update" ? event["partialResult"] : event["result"];
      const callId = string(event["toolCallId"]);
      if (!callId) {
        yield* publish({ kind: "error", source: "protocol", message: "Tool execution event is missing its call identity", detail: event });
        return;
      }
      const reportedName = string(event["toolName"]);
      const knownToolNames = yield* Ref.get(activeToolNames);
      const name = reportedName || knownToolNames.get(callId) || "";
      const isError = event["isError"] === true;
      yield* Ref.update(activeToolNames, (names) => {
        const next = new Map(names);
        if (phase === "end") next.delete(callId);
        else if (name) next.set(callId, name);
        return next;
      });
      let ipython: IPythonExecution | undefined;
      const currentExecutions = yield* Ref.get(activeIPythonExecutions);
      const previous = currentExecutions.get(callId);
      if (isIPythonToolName(name) || previous !== undefined) {
        const observedAt = Date.now();
        const monotonicObservedAt = performance.now();
        const currentState = yield* Ref.get(state);
        const detail = ipythonDetail(payload) || previous?.detail || "";
        const activeExecution: ActiveIPythonExecution = phase === "start" || previous === undefined
          ? {
              executionTarget: currentState.executionTarget,
              code: phase === "start" ? string(asRecord(payload)["code"]) : "",
              startedAt: observedAt,
              monotonicStartedAt: monotonicObservedAt,
              detail,
            }
          : { ...previous, detail };
        ipython = {
          executionTarget: activeExecution.executionTarget,
          status: ipythonStatus(phase, payload, isError),
          code: activeExecution.code,
          detail,
          startedAt: activeExecution.startedAt,
          durationMs: phase === "end" ? Math.max(0, monotonicObservedAt - activeExecution.monotonicStartedAt) : null,
        };
        yield* Ref.update(activeIPythonExecutions, (executions) => {
          const next = new Map(executions);
          if (phase === "end") next.delete(callId);
          else next.set(callId, activeExecution);
          return next;
        });
      }
      yield* publish({ kind: "tool", sequence, phase, callId, name, isError, detail: toolDetail(payload), ...(ipython ? { ipython } : {}) });
      return;
    }
    const lifecycle = new Set(["agent_start", "agent_end", "turn_start", "turn_end", "message_start", "message_end", "session_action_update", "compaction_start", "compaction_end", "auto_retry_start", "auto_retry_end"]);
    if (lifecycle.has(type)) {
      if (type === "agent_end") yield* closeActiveAssistantMessage(sequence);
      yield* publish({ kind: "lifecycle", sequence, type, detail: event });
      if (type === "agent_start" || type === "agent_end" || type === "compaction_start" || type === "compaction_end") {
        const next = yield* Ref.updateAndGet(state, (current) => ({
          ...current,
          isStreaming: type === "agent_start" ? true : type === "agent_end" ? false : current.isStreaming,
          isCompacting: type === "compaction_start" ? true : type === "compaction_end" ? false : current.isCompacting,
        }));
        yield* publish({ kind: "state", state: { ...next } });
      }
      if (type === "agent_end" || type === "compaction_end") yield* Effect.forkDetach(refresh.pipe(Effect.ignore));
      return;
    }
    if (type === "extension_ui_request") {
      const method = string(event["method"]);
      const isPassive = method === "notify" || method === "setStatus";
      yield* write(`${JSON.stringify({
        type: "extension_ui_response",
        id: string(event["id"]),
        ...(isPassive ? { confirmed: false } : { cancelled: true }),
      })}\n`).pipe(Effect.ignore);
      if (!isPassive) return;

      if (method === "notify") {
        const activeSwitch = yield* Ref.get(executionTargetSwitch);
        const message = string(event["message"]);
        if (Option.isSome(activeSwitch)) {
          const expected = activeSwitch.value.target === "modal"
            ? "IPython is now running on Modal."
            : "IPython is now running locally.";
          if (event["notifyType"] === "error") {
            yield* Deferred.fail(activeSwitch.value.deferred, rpcError("set_execution_target", message || "Execution target switch failed", event));
          } else if (message === expected) {
            const next = yield* Ref.updateAndGet(state, (current) => ({ ...current, executionTarget: activeSwitch.value.target }));
            yield* publishState(next);
            yield* Deferred.succeed(activeSwitch.value.deferred, undefined);
          }
        }
        if (event["notifyType"] === "error") {
          yield* publish({ kind: "error", source: "extension", message: message || "Extension error", detail: event });
        }
      }
      return;
    }
    if (type === "extension_error") { yield* publish({ kind: "error", source: "extension", message: string(event["error"]) || "Extension error", detail: event }); return; }
    yield* publish({ kind: "raw", sequence, event });
  });

  const handleRecord = Effect.fn("PrimeAgentRpc.handleRecord")(function* (bytes: Buffer) {
    yield* Ref.update(eventSequence, (value) => value + 1);
    const decoded = yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      catch: (cause) => rpcError("decode", "RPC stdout contained invalid UTF-8", cause),
    });
    const unknown = yield* Effect.try({ try: () => JSON.parse(decoded) as unknown, catch: (cause) => rpcError("parse", "RPC stdout contained malformed JSON", cause) });
    const envelope = yield* Schema.decodeUnknownEffect(RpcEnvelope)(unknown).pipe(
      Effect.mapError((cause) => rpcError("parse", "RPC stdout record has no event type", cause)),
    );
    if (envelope.type === "response") {
      const response = yield* Schema.decodeUnknownEffect(RpcResponse)(unknown).pipe(
        Effect.mapError((cause) => rpcError("parse", "Malformed RPC response", cause)),
      );
      yield* handleResponse(response);
    } else yield* handleEvent(asRecord(unknown));
  });

  const protocolFailure = Effect.fn("PrimeAgentRpc.protocolFailure")(function* (error: PrimeAgentRpcError) {
    yield* publish({ kind: "error", source: "protocol", message: error.message, detail: error });
    yield* failAllPending(error);
    yield* failExecutionTargetSwitch(error);
    yield* setConnection("failed", error.message);
    const current = yield* Ref.get(child); if (Option.isSome(current)) signalProcessTree(current.value, "SIGTERM");
  });

  const consume = Stream.fromQueue(messages).pipe(Stream.runForEach((message) => Effect.gen(function* () {
    if (message._tag === "End") {
      const current = yield* Ref.get(framing);
      if (current.carry.length > 0) yield* protocolFailure(rpcError("framing", "RPC stdout ended with an unterminated record"));
      return;
    }
    const current = yield* Ref.get(framing); const result = frameChunk(current, message.chunk); yield* Ref.set(framing, result.state);
    if (result.fault) { yield* protocolFailure(rpcError("framing", result.fault)); return; }
    yield* Effect.forEach(result.records, (record) => handleRecord(record).pipe(Effect.catch((error) => protocolFailure(error))), { discard: true });
  })));

  const stop = Effect.gen(function* () {
    const current = yield* Ref.getAndSet(child, Option.none());
    const exitSignal = yield* Ref.getAndSet(processExit, Option.none());
    if (Option.isNone(current)) return;
    const agentProcess = current.value;
    if (!agentProcess.stdin.destroyed) agentProcess.stdin.end();
    const error = rpcError("stop", "Prime Agent stopped");
    yield* failAllPending(error);
    yield* failExecutionTargetSwitch(error);
    if (agentProcess.exitCode === null && agentProcess.signalCode === null) {
      yield* Effect.try({ try: () => signalProcessTree(agentProcess, "SIGTERM"), catch: (cause) => rpcError("stop", "Could not terminate Prime Agent", cause) });
    }
    if (Option.isSome(exitSignal)) {
      const terminated = yield* Deferred.await(exitSignal.value).pipe(
        Effect.as(true),
        Effect.raceFirst(Effect.sleep("2 seconds").pipe(Effect.as(false))),
      );
      if (!terminated && agentProcess.exitCode === null && agentProcess.signalCode === null) {
        yield* Effect.try({ try: () => signalProcessTree(agentProcess, "SIGKILL"), catch: (cause) => rpcError("stop", "Could not kill Prime Agent", cause) });
        const reaped = yield* Deferred.await(exitSignal.value).pipe(
          Effect.as(true),
          Effect.raceFirst(Effect.sleep("2 seconds").pipe(Effect.as(false))),
        );
        if (!reaped) return yield* rpcError("stop", "Prime Agent did not exit after SIGKILL");
      }
    }
    yield* setConnection("closed", "Prime Agent stopped");
    agentProcess.stdout.removeAllListeners();
    agentProcess.stderr.removeAllListeners();
    agentProcess.removeAllListeners();
  }).pipe(Effect.withSpan("PrimeAgentRpc.stop"));

  const startUnsafe = Effect.gen(function* () {
    const running = yield* Ref.get(child);
    if (Option.isSome(running) && running.value.exitCode === null && running.value.signalCode === null) return;
    const forbiddenSessionArgs = new Set(["--continue", "-c", "--resume", "-r", "--session"]);
    if ((options.extraArgs ?? []).some((argument) => forbiddenSessionArgs.has(argument) || argument.startsWith("--continue=") || argument.startsWith("--resume=") || argument.startsWith("--session="))) {
      return yield* rpcError("start", "Session-resume arguments are not allowed for an owned RPC instance");
    }
    yield* Ref.set(framing, { carry: Buffer.alloc(0) });
    yield* Ref.set(stderr, Buffer.alloc(0));
    const projectPath = yield* Effect.tryPromise({ try: () => realpath(options.projectPath), catch: (cause) => rpcError("start", "Project path cannot be resolved", cause) });
    const remoteExtensionPath = yield* Effect.tryPromise({ try: () => realpath(options.remoteExtensionPath), catch: (cause) => rpcError("start", "Remote extension path cannot be resolved", cause) });
    yield* Effect.try({
      try: () => {
        if (!statSync(projectPath).isDirectory() || !statSync(options.nodePath).isFile() || !statSync(options.cliPath).isFile() || !statSync(remoteExtensionPath).isDirectory()) {
          throw new Error("Runtime path is invalid");
        }
      },
      catch: (cause) => rpcError("start", "Prime Agent runtime is missing", cause),
    });
    const executionTarget = yield* Effect.promise(() => readExecutionTarget(projectPath, options.environment ?? {}));
    yield* Ref.update(state, (current) => ({ ...current, executionTarget }));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...options.environment,
      ...(options.remoteUvPath === undefined ? {} : { PRIME_AGENT_REMOTE_UV: options.remoteUvPath }),
      NO_COLOR: process.env["NO_COLOR"] || "1",
    };
    delete env["FORCE_COLOR"];
    const agentProcess = yield* Effect.try({
      try: () => spawn(options.nodePath, [options.cliPath, "--mode", "rpc", "--cwd", projectPath, "--thinking", "xhigh", "-e", remoteExtensionPath, ...(options.extraArgs ?? [])], { cwd: projectPath, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" }),
      catch: (cause) => rpcError("start", "Prime Agent process could not be spawned", cause),
    });
    const exited = yield* Deferred.make<void>();
    yield* Ref.set(processExit, Option.some(exited));
    yield* Ref.set(child, Option.some(agentProcess));
    yield* setConnection("starting", "Launching Prime Agent RPC");
    yield* Effect.sync(() => {
      agentProcess.stdout.on("data", (chunk: Buffer) => {
        agentProcess.stdout.pause();
        void Effect.runPromise(Queue.offer(messages, { _tag: "Chunk", chunk: Buffer.from(chunk) }))
          .then(() => { if (!agentProcess.stdout.destroyed) agentProcess.stdout.resume(); });
      });
      agentProcess.stdout.on("end", () => { Effect.runFork(Queue.offer(messages, { _tag: "End" })); });
      agentProcess.stderr.on("data", (chunk: Buffer) => { Effect.runFork(Ref.update(stderr, (current) => Buffer.concat([current, chunk]).subarray(-MAX_STDERR_BYTES))); });
      agentProcess.on("error", (cause) => { Effect.runFork(protocolFailure(rpcError("process", cause.message, cause))); });
      agentProcess.on("exit", (code, signal) => { Effect.runFork(Effect.gen(function* () {
        yield* Deferred.succeed(exited, undefined);
        yield* Ref.set(child, Option.none());
        const diagnostic = (yield* Ref.get(stderr)).toString("utf8").trim();
        const message = `Prime Agent exited (${signal ?? code ?? "unknown"})${diagnostic ? `: ${diagnostic}` : ""}`;
        yield* failAllPending(rpcError("process", message));
        const current = yield* Ref.get(state); if (current.connection !== "closed") yield* setConnection("failed", message);
      })); });
    });
    const startupTimeout = Effect.sleep(STARTUP_TIMEOUT).pipe(Effect.andThen(Effect.fail(rpcError("start", "Prime Agent startup timed out"))));
    yield* refresh.pipe(Effect.raceFirst(startupTimeout));
    yield* setConnection("ready", "Live Prime Agent RPC");
  }).pipe(
    Effect.tapError((error) => protocolFailure(error).pipe(Effect.andThen(stop.pipe(Effect.ignore)))),
    Effect.withSpan("PrimeAgentRpc.start"),
  );
  const start = exclusively(startUnsafe);

  const availableCommands = request("get_commands", {}).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(RpcSlashCommandResponse)),
    Effect.map((data): readonly AgentSlashCommand[] => data.commands),
    Effect.mapError((cause) => cause instanceof PrimeAgentRpcError ? cause : rpcError("get_commands", "Prime Agent returned an invalid command catalog", cause)),
  );

  const canonicalThinkingLevels: readonly AgentThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
  const thinkingLevelsForModel = (model: typeof RpcModel.Type): readonly AgentThinkingLevel[] => {
    if (model.reasoning !== true) return ["off"];
    return canonicalThinkingLevels.filter((level) => {
      const mapped = model.thinkingLevelMap?.[level];
      if (mapped === null) return false;
      if (level === "xhigh" || level === "max") return mapped !== undefined;
      return true;
    });
  };
  const toPrimeAgentModel = (model: typeof RpcModel.Type): PrimeAgentModel => ({
    provider: model.provider,
    id: model.id,
    name: model.name ?? model.id,
    thinkingLevels: thinkingLevelsForModel(model),
  });
  const parseModel = (operation: string, value: unknown) => Schema.decodeUnknownEffect(RpcModel)(value).pipe(
    Effect.map(toPrimeAgentModel),
    Effect.mapError((cause) => rpcError(operation, "Prime Agent returned an invalid model", cause)),
  );

  const availableModels = request("get_available_models", {}).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(RpcAvailableModelsResponse)),
    Effect.map((catalog): readonly PrimeAgentModel[] => catalog.models.map(toPrimeAgentModel)),
    Effect.mapError((cause) => cause instanceof PrimeAgentRpcError ? cause : rpcError("get_available_models", "Prime Agent returned an invalid model catalog", cause)),
  );

  const currentModel = request("get_state", {}).pipe(
    Effect.flatMap((value) => parseModel("get_state", asRecord(value)["model"])),
  );

  const setModelUnsafe = Effect.fn("PrimeAgentRpc.setModel")(function* (identity: PrimeAgentModelIdentity) {
    if (!identity.provider || !identity.id) return yield* rpcError("set_model", "Model provider and ID must not be empty");
    const catalog = yield* availableModels;
    const selected = catalog.find((model) => model.provider === identity.provider && model.id === identity.id);
    if (selected === undefined) return yield* rpcError("set_model", `Unknown model: ${identity.provider}/${identity.id}`);
    const model = yield* request("set_model", { provider: selected.provider, modelId: selected.id }).pipe(
      Effect.flatMap((value) => parseModel("set_model", value)),
    );
    if (model.provider !== selected.provider || model.id !== selected.id) {
      return yield* rpcError("set_model", `Prime Agent selected ${model.provider}/${model.id} instead of ${selected.provider}/${selected.id}`);
    }
    yield* request("get_state", {});
    return selected;
  });
  const setModel = (model: PrimeAgentModelIdentity) => exclusively(setModelUnsafe(model));

  const getRlmMaxDepthStatus = request("get_rlm_max_depth_status", {}).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(RpcRlmMaxDepthStatus)),
    Effect.map((status): RlmMaxDepthStatus => status),
    Effect.mapError((cause) => cause instanceof PrimeAgentRpcError ? cause : rpcError("get_rlm_max_depth_status", "Prime Agent returned an invalid RLM max-depth status", cause)),
  );

  const setRlmMaxDepthUnsafe = Effect.fn("PrimeAgentRpc.setRlmMaxDepth")(function* (maxDepth: number) {
    if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) return yield* rpcError("set_rlm_max_depth", "RLM max depth must be a non-negative integer");
    return yield* request("set_rlm_max_depth", { maxDepth }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(RpcRlmMaxDepthStatus)),
      Effect.map((status): RlmMaxDepthStatus => status),
      Effect.mapError((cause) => cause instanceof PrimeAgentRpcError ? cause : rpcError("set_rlm_max_depth", "Prime Agent returned an invalid RLM max-depth status", cause)),
    );
  });
  const setRlmMaxDepth = (maxDepth: number) => exclusively(setRlmMaxDepthUnsafe(maxDepth));

  const configureThenPrompt = (configuration: ConfigureFirstPrompt) => exclusively(Effect.gen(function* () {
    yield* startUnsafe;
    const fresh = asRecord(yield* request("new_session", {}));
    if (fresh["cancelled"] === true) return yield* rpcError("new_session", "Prime Agent cancelled owned-session creation");
    const selected = yield* setModelUnsafe(configuration.model);
    if (!selected.thinkingLevels.includes(configuration.thinkingLevel)) {
      return yield* rpcError(
        "set_thinking_level",
        `Thinking level ${configuration.thinkingLevel} is unsupported by ${selected.provider}/${selected.id}`,
      );
    }
    yield* request("set_thinking_level", { level: configuration.thinkingLevel });
    const payload: Record<string, unknown> = { message: configuration.message };
    if (configuration.behavior && configuration.behavior !== "now") payload["streamingBehavior"] = configuration.behavior;
    yield* request("prompt", payload);
  }));

  const commandUnsafe = Effect.fn("PrimeAgentRpc.command")(function* (input: AgentCommand) {
    switch (input.type) {
      case "prompt": {
        const payload: Record<string, unknown> = { message: input.message };
        if (input.behavior && input.behavior !== "now") payload["streamingBehavior"] = input.behavior;
        yield* request("prompt", payload); return {};
      }
      case "set_model": {
        yield* setModelUnsafe({ provider: input.provider, id: input.modelId });
        return {};
      }
      case "set_execution_target": {
        const current = yield* Ref.get(state);
        if (current.connection !== "ready") return yield* rpcError("set_execution_target", "Prime Agent RPC is not ready");
        if (current.isStreaming || current.isCompacting) return yield* rpcError("set_execution_target", "Execution target cannot change while the agent is busy");
        if (current.switchingExecutionTo !== undefined) return yield* rpcError("set_execution_target", "An execution target switch is already in progress");
        if (current.executionTarget === input.target) return {};

        const deferred = yield* Deferred.make<void, PrimeAgentRpcError>();
        const claimed = yield* Ref.modify(executionTargetSwitch, (activeSwitch) => Option.isSome(activeSwitch)
          ? [false, activeSwitch] as const
          : [true, Option.some({ target: input.target, deferred })] as const);
        if (!claimed) return yield* rpcError("set_execution_target", "An execution target switch is already in progress");
        const switching = yield* Ref.updateAndGet(state, (value) => ({ ...value, switchingExecutionTo: input.target }));
        yield* publishState(switching);
        const timeout = Effect.sleep(EXECUTION_TARGET_TIMEOUT).pipe(
          Effect.andThen(Effect.fail(rpcError("set_execution_target", "Execution target switch timed out"))),
        );
        yield* Effect.gen(function* () {
          yield* request("prompt", { message: `/remote ${input.target}` });
          yield* Deferred.await(deferred).pipe(Effect.raceFirst(timeout));
        }).pipe(
          Effect.tapError(() => request("abort", {}).pipe(Effect.ignore)),
          Effect.onInterrupt(() => request("abort", {}).pipe(Effect.ignore)),
          Effect.ensuring(clearExecutionTargetSwitch()),
        );
        return {};
      }
      case "abort": {
        yield* request("abort", {});
        yield* failExecutionTargetSwitch(rpcError("set_execution_target", "Execution target switch was interrupted"));
        return {};
      }
      case "new_session": {
        const value = asRecord(yield* request("new_session", {}));
        if (value["cancelled"] === true) return { cancelled: true };
        yield* Ref.set(activeIPythonExecutions, new Map());
        yield* Ref.set(activeToolNames, new Map());
        yield* refresh; return {};
      }
      case "compact": yield* request("compact", {}); yield* refresh; return {};
      case "cycle_model": yield* request("cycle_model", {}); yield* request("get_state", {}); return {};
      case "cycle_thinking_level": yield* request("cycle_thinking_level", {}); yield* request("get_state", {}); return {};
      case "refresh": yield* refresh; return {};
    }
  });
  const command = (input: AgentCommand) => exclusively(commandUnsafe(input));

  yield* Effect.forkScoped(consume);
  yield* Effect.addFinalizer(() => stop.pipe(Effect.ignore));
  return PrimeAgentRpc.of({
    start, stop, state: snapshot, events: Stream.fromPubSub(events), availableCommands,
    availableModels, currentModel, setModel, getRlmMaxDepthStatus, setRlmMaxDepth,
    configureThenPrompt, command,
  });
});

/** Creates one Prime Agent process adapter whose listeners and process are owned by the provided Scope. */
export const makeScoped = (options: Options): Effect.Effect<PrimeAgentRpcInstance, never, Scope.Scope> => make(options);

/** Provides a scope-owned PrimeAgentRpc service. */
export const layer = (options: Options) => Layer.effect(PrimeAgentRpc, makeScoped(options));
