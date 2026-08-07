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
import * as Stream from "effect/Stream";
import type { AgentCommand, AgentEvent, AgentState, ExecutionTarget } from "../shared/contract";

const MAX_LINE_BYTES = 32 * 1024 * 1024;
const MAX_STDERR_BYTES = 128 * 1024;
const REQUEST_TIMEOUT = "30 seconds";
const STARTUP_TIMEOUT = "45 seconds";
const EXECUTION_TARGET_TIMEOUT = "10 minutes";

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

interface Options {
  readonly nodePath: string;
  readonly cliPath: string;
  readonly projectPath: string;
  readonly remoteExtensionPath: string;
  readonly remoteUvPath?: string;
  readonly extraArgs?: readonly string[];
  readonly environment?: Readonly<Record<string, string>>;
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

export class PrimeAgentRpc extends Context.Service<
  PrimeAgentRpc,
  {
    readonly start: Effect.Effect<void>;
    readonly stop: Effect.Effect<void>;
    readonly state: Effect.Effect<AgentState>;
    readonly events: Stream.Stream<AgentEvent>;
    readonly command: (command: AgentCommand) => Effect.Effect<{ readonly cancelled?: boolean }, PrimeAgentRpcError>;
  }
>()("@ernie/main/PrimeAgentRpc") {}

export const make = (options: Options) => Effect.gen(function* () {
  const state = yield* Ref.make(initialState());
  const child = yield* Ref.make<Option.Option<ChildProcessWithoutNullStreams>>(Option.none());
  const pending = yield* Ref.make<ReadonlyMap<string, PendingRequest>>(new Map());
  const requestSequence = yield* Ref.make(0);
  const eventSequence = yield* Ref.make(0);
  const assistantMessageSequence = yield* Ref.make(0);
  const activeAssistantMessage = yield* Ref.make<Option.Option<string>>(Option.none());
  const stderr = yield* Ref.make(Buffer.alloc(0));
  const messages = yield* Queue.unbounded<ProcessMessage>();
  const framing = yield* Ref.make<FramingState>({ carry: Buffer.alloc(0) });
  const events = yield* PubSub.unbounded<AgentEvent>();
  const executionTargetSwitch = yield* Ref.make<Option.Option<{ readonly target: ExecutionTarget; readonly deferred: Deferred.Deferred<void, PrimeAgentRpcError> }>>(Option.none());

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
      yield* Deferred.fail(request.deferred, rpcError(response.command, string(error["message"]) || `${response.command} failed`, response.error)); return;
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
    if (type === "tool_execution_start" || type === "tool_execution_update" || type === "tool_execution_end") {
      const phase = type.endsWith("start") ? "start" as const : type.endsWith("update") ? "update" as const : "end" as const;
      const payload = phase === "start" ? event["args"] : phase === "update" ? event["partialResult"] : event["result"];
      yield* publish({ kind: "tool", sequence, phase, callId: string(event["toolCallId"]), name: string(event["toolName"]), isError: event["isError"] === true, detail: toolDetail(payload) });
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
    const current = yield* Ref.get(child); if (Option.isSome(current) && current.value.exitCode === null) current.value.kill("SIGTERM");
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
    if (Option.isNone(current)) return;
    current.value.stdin.end();
    if (current.value.exitCode === null) current.value.kill("SIGTERM");
    const error = rpcError("stop", "Prime Agent stopped");
    yield* failAllPending(error);
    yield* failExecutionTargetSwitch(error);
    yield* setConnection("closed", "Prime Agent stopped");
  }).pipe(Effect.withSpan("PrimeAgentRpc.stop"));

  const start = Effect.gen(function* () {
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
      try: () => spawn(options.nodePath, [options.cliPath, "--mode", "rpc", "--cwd", projectPath, "--thinking", "xhigh", "-e", remoteExtensionPath, ...(options.extraArgs ?? [])], { cwd: projectPath, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true }),
      catch: (cause) => rpcError("start", "Prime Agent process could not be spawned", cause),
    });
    yield* Ref.set(child, Option.some(agentProcess));
    yield* setConnection("starting", "Launching Prime Agent RPC");
    yield* Effect.sync(() => {
      agentProcess.stdout.on("data", (chunk: Buffer) => { Effect.runFork(Queue.offer(messages, { _tag: "Chunk", chunk: Buffer.from(chunk) })); });
      agentProcess.stdout.on("end", () => { Effect.runFork(Queue.offer(messages, { _tag: "End" })); });
      agentProcess.stderr.on("data", (chunk: Buffer) => { Effect.runFork(Ref.update(stderr, (current) => Buffer.concat([current, chunk]).subarray(-MAX_STDERR_BYTES))); });
      agentProcess.on("error", (cause) => { Effect.runFork(protocolFailure(rpcError("process", cause.message, cause))); });
      agentProcess.on("exit", (code, signal) => { Effect.runFork(Effect.gen(function* () {
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
    Effect.catch((error) => protocolFailure(error)),
    Effect.withSpan("PrimeAgentRpc.start"),
  );

  const command = Effect.fn("PrimeAgentRpc.command")(function* (input: AgentCommand) {
    switch (input.type) {
      case "prompt": {
        const payload: Record<string, unknown> = { message: input.message };
        if (input.behavior && input.behavior !== "now") payload["streamingBehavior"] = input.behavior;
        yield* request("prompt", payload); return {};
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
        yield* refresh; return {};
      }
      case "compact": yield* request("compact", {}); yield* refresh; return {};
      case "cycle_model": yield* request("cycle_model", {}); yield* request("get_state", {}); return {};
      case "cycle_thinking_level": yield* request("cycle_thinking_level", {}); yield* request("get_state", {}); return {};
      case "refresh": yield* refresh; return {};
    }
  });

  yield* Effect.forkScoped(consume);
  yield* Effect.addFinalizer(() => stop);
  return PrimeAgentRpc.of({ start, stop, state: snapshot, events: Stream.fromPubSub(events), command });
});

export const layer = (options: Options) => Layer.effect(PrimeAgentRpc, make(options));
