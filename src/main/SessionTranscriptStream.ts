import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import type {
  SessionTranscriptEvent,
  SessionTranscriptMessage,
  SessionTranscriptSnapshot,
  SessionTranscriptTextBlock,
  SessionTranscriptTool,
} from "../shared/sessionTranscript";

const PROTOCOL = { name: "prime-agent.daemon", version: 7 } as const;
const DEFAULT_MAX_LINE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_HISTORY_ITEMS = 1_000;
const REQUEST_TIMEOUT_MS = 10_000;

/** Safe failures produced while reading a daemon transcript. */
export class SessionTranscriptStreamError extends Schema.TaggedErrorClass<SessionTranscriptStreamError>()(
  "SessionTranscriptStreamError",
  { operation: Schema.String, message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}

/** Configuration for the daemon transcript adapter. */
export interface SessionTranscriptStreamOptions {
  readonly socketPath?: string;
  readonly maxLineBytes?: number;
  readonly maxHistoryItems?: number;
  readonly requestTimeoutMs?: number;
  /** Deterministic reconnect backoff; exhaustion closes the selected stream. */
  readonly reconnectDelaysMs?: readonly number[];
  readonly maxBufferedEvents?: number;
}

/** Returns Prime Agent's per-user default daemon endpoint. */
export function defaultSessionTranscriptSocketPath(): string {
  if (process.platform === "win32") return "\\.\pipe\prime-agent-daemon";
  const suffix = typeof process.getuid === "function" ? String(process.getuid()) : "user";
  return join(tmpdir(), `prime-agent-${suffix}`, "daemon.sock");
}

/** Read-only access to one selected daemon session's transcript. */
export class SessionTranscriptStream extends Context.Service<
  SessionTranscriptStream,
  {
    /** Detaches the previous selection, attaches the requested session, and returns its bounded snapshot. */
    readonly select: (activeSessionId: string) => Effect.Effect<SessionTranscriptSnapshot, SessionTranscriptStreamError>;
    /** Detaches the selected session without stopping it. */
    readonly detach: Effect.Effect<void, SessionTranscriptStreamError>;
    /** Ordered snapshot and live transcript projections for the selected session. */
    readonly events: Stream.Stream<SessionTranscriptEvent>;
  }
>()("@ernie/main/SessionTranscriptStream") {}

type RecordValue = Readonly<Record<string, unknown>>;
type Pending = { readonly command: "attach" | "detach"; readonly resolve: (value: unknown) => void; readonly reject: (error: SessionTranscriptStreamError) => void; readonly timeout: NodeJS.Timeout };

function record(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as RecordValue : null;
}
function requiredString(value: unknown): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
function nonNegativeInteger(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
function eventCursor(value: unknown): { readonly generation: string; readonly sequence: number } | undefined {
  const cursor = record(value);
  const generation = requiredString(cursor?.["generation"]);
  const sequence = nonNegativeInteger(cursor?.["sequence"]);
  return generation && sequence !== null ? { generation, sequence } : undefined;
}
function safeToolName(value: unknown): string { return typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value) ? value : "tool"; }
function status(value: unknown, isError: boolean): SessionTranscriptTool["status"] {
  if (value === "aborted") return "aborted";
  if (isError || value === "error" || value === "failed") return "failed";
  return "succeeded";
}
function textBlocks(message: RecordValue): readonly SessionTranscriptTextBlock[] {
  const content = message["content"];
  if (typeof content === "string") return [{ contentIndex: 0, text: content }];
  if (!Array.isArray(content)) return [];
  return content.flatMap((value, contentIndex) => {
    const block = record(value);
    return block?.["type"] === "text" && typeof block["text"] === "string" ? [{ contentIndex, text: block["text"] }] : [];
  });
}
function messageId(message: RecordValue, fallback: string): string {
  return requiredString(message["id"]) ?? requiredString(message["messageId"]) ?? fallback;
}


function boundedDetail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/(?:\/Users|\/home|\/var|\/tmp|[A-Za-z]:\\)[^\s'"`]+/g, "[path]")
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 8_000);
}
function resultDetail(value: unknown): string {
  const result = record(value);
  const content = result?.["content"];
  if (Array.isArray(content)) {
    const text = content.flatMap((entry) => {
      const block = record(entry);
      return block?.["type"] === "text" && typeof block["text"] === "string" ? [block["text"]] : [];
    }).join("\n");
    if (text) return boundedDetail(text);
  }
  const details = record(result?.["details"]);
  for (const key of ["stdout", "stderr", "result", "errorEname"]) {
    const detail = boundedDetail(details?.[key]);
    if (detail) return detail;
  }
  return "";
}
function projectSnapshot(activeSessionId: string, value: unknown, maxHistoryItems: number): SessionTranscriptSnapshot {
  const data = record(value);
  const snapshot = record(data?.["snapshot"]);
  if (requiredString(data?.["activeSessionId"]) !== activeSessionId || requiredString(snapshot?.["activeSessionId"]) !== activeSessionId) {
    throw new Error("Attach response did not match the selected session");
  }
  const rawMessages = snapshot?.["messages"];
  if (!Array.isArray(rawMessages)) throw new Error("Attach response has no transcript snapshot");
  const selected = rawMessages.slice(-maxHistoryItems);
  const items: Array<SessionTranscriptMessage | SessionTranscriptTool> = [];
  const toolNames = new Map<string, string>();
  selected.forEach((unknownMessage, index) => {
    const message = record(unknownMessage);
    if (!message) return;
    const role = message["role"];
    if (role === "user" || role === "assistant") {
      items.push({ kind: "message", messageId: messageId(message, `snapshot:${rawMessages.length - selected.length + index}`), role, blocks: textBlocks(message) });
      if (role === "assistant" && Array.isArray(message["content"])) {
        for (const value of message["content"]) {
          const block = record(value);
          if (block?.["type"] !== "toolCall") continue;
          const callId = requiredString(block["id"]);
          if (!callId) continue;
          const name = safeToolName(block["name"]);
          toolNames.set(callId, name);
          const execution = name === "ipython" ? { executionTarget: "unknown" as const, status: "running" as const, code: typeof record(block["arguments"])?.["code"] === "string" ? String(record(block["arguments"])?.["code"]).slice(0, 32_000) : "", detail: "", startedAt: null, durationMs: null } : undefined;
          items.push({ kind: "tool", callId, name, phase: "start", status: "running", detail: "", ipython: name === "ipython", ...(execution ? { execution } : {}) });
        }
      }
      return;
    }
    if (role === "toolResult") {
      const callId = requiredString(message["toolCallId"]);
      if (!callId) return;
      const name = safeToolName(message["toolName"] ?? toolNames.get(callId));
      const details = record(message["details"]);
      const toolStatus = status(details?.["status"], message["isError"] === true);
      const detail = name === "ipython" ? resultDetail(message) : toolStatus === "succeeded" ? "Succeeded" : toolStatus === "failed" ? "Failed" : "Aborted";
      const execution = name === "ipython" ? { executionTarget: "unknown" as const, status: toolStatus, code: "", detail, startedAt: null, durationMs: null } : undefined;
      items.push({ kind: "tool", callId, name, phase: "end", status: toolStatus, detail, ipython: name === "ipython", ...(execution ? { execution } : {}) });
    }
  });
  return { kind: "snapshot", activeSessionId, items, historyTruncated: rawMessages.length > selected.length };
}

class Connection {
  readonly eventsQueue: Queue.Queue<SessionTranscriptEvent>;
  readonly clientId = `ernie-transcript:${randomUUID()}`;
  private readonly pending = new Map<string, Pending>();
  private readonly toolNames = new Map<string, string>();
  private readonly ipythonExecutions = new Map<string, { readonly code: string; readonly detail: string; readonly startedAt: number; readonly monotonicStartedAt: number }>();
  private socket: Socket | undefined;
  private carry = Buffer.alloc(0);
  private requestId = 0;
  private selected: string | undefined;
  private hello = false;
  private helloResolve: (() => void) | undefined;
  private helloReject: ((error: SessionTranscriptStreamError) => void) | undefined;
  private activeAssistantId: string | undefined;
  private assistantSequence = 0;
  private attaching = false;
  private bufferedEvents: SessionTranscriptEvent[] = [];
  private lastEventCursor: { readonly generation: string; readonly sequence: number } | undefined;
  private selectionEpoch = 0;
  private reconnectScheduledEpoch: number | undefined;
  private closing = false;

  constructor(
    private readonly options: Required<SessionTranscriptStreamOptions>,
    eventsQueue: Queue.Queue<SessionTranscriptEvent>,
    readonly reconnectSignals: Queue.Queue<void>,
  ) { this.eventsQueue = eventsQueue; }

  connect(): Promise<void> {
    const supersededHandshake = this.helloReject;
    this.helloResolve = undefined;
    this.helloReject = undefined;
    supersededHandshake?.(this.error("connect", "Daemon handshake superseded by a newer connection"));
    this.socket?.destroy();
    this.socket = undefined;
    this.hello = false;
    return new Promise((resolve, reject) => {
      this.helloResolve = resolve;
      this.helloReject = reject;
      const socket = createConnection(this.options.socketPath);
      this.socket = socket;
      const timeout = setTimeout(() => this.onTransportFailure("handshake", "Prime Agent daemon handshake timed out"), this.options.requestTimeoutMs);
      const finish = () => clearTimeout(timeout);
      socket.on("data", (chunk: Buffer) => { if (this.socket === socket) this.onChunk(chunk); });
      socket.once("error", () => { if (this.socket === socket) this.onTransportFailure("connect", "Unable to connect to the Prime Agent daemon"); });
      socket.once("close", () => { if (this.socket === socket) this.onTransportFailure("connection", "Prime Agent daemon connection closed"); });
      const originalResolve = this.helloResolve;
      this.helloResolve = () => { finish(); originalResolve?.(); };
      const originalReject = this.helloReject;
      this.helloReject = (error) => { finish(); originalReject?.(error); };
    });
  }

  async select(activeSessionId: string): Promise<SessionTranscriptSnapshot> {
    if (!activeSessionId || activeSessionId.length > 256) throw this.error("select", "Invalid session identity");
    this.cancelReconnect();
    if (!this.hello) await this.connect();
    if (this.selected && this.selected !== activeSessionId) await this.request("detach", { activeSessionId: this.selected });
    this.selected = activeSessionId;
    this.lastEventCursor = undefined;
    return this.attachSelected(false);
  }

  private async attachSelected(reconnecting: boolean, expectedEpoch?: number): Promise<SessionTranscriptSnapshot> {
    const activeSessionId = this.selected;
    if (!activeSessionId) throw this.error("attach", "No session is selected");
    this.attaching = true;
    this.bufferedEvents = [];
    if (!reconnecting) {
      this.activeAssistantId = undefined;
      this.toolNames.clear();
      this.ipythonExecutions.clear();
    }
    let data: unknown;
    let attachAccepted = false;
    try {
      data = await this.request("attach", {
        activeSessionId,
        clientId: this.clientId,
        capabilities: ["attach_snapshot", "event_sequence", "slim_attach"],
        supportsExtensionUi: false,
        ...(this.lastEventCursor ? { resumeCursor: { activeSessionId, ...this.lastEventCursor } } : {}),
      });
      attachAccepted = true;
      if (this.selected !== activeSessionId || (expectedEpoch !== undefined && this.selectionEpoch !== expectedEpoch)) {
        attachAccepted = false;
        throw this.error("attach", "Session selection changed while attaching");
      }
      const snapshot = projectSnapshot(activeSessionId, data, this.options.maxHistoryItems);
      const response = record(data);
      const observedCursor = eventCursor(response?.["lastEventCursor"])
        ?? eventCursor(record(response?.["snapshot"])?.["lastEventCursor"]);
      if (observedCursor) this.observeCursor(observedCursor);
      Queue.offerUnsafe(this.eventsQueue, snapshot);
      this.attaching = false;
      for (const event of this.bufferedEvents) Queue.offerUnsafe(this.eventsQueue, event);
      this.bufferedEvents = [];
      return snapshot;
    } catch (cause) {
      const ownsAttachment = expectedEpoch === undefined || this.selectionEpoch === expectedEpoch;
      if (ownsAttachment) {
        this.attaching = false;
        this.bufferedEvents = [];
      }
      if (attachAccepted && ownsAttachment) this.terminalFailure("attach", "Malformed attach snapshot");
      throw cause;
    }
  }

  async detach(): Promise<void> {
    this.cancelReconnect();
    const selected = this.selected;
    this.selected = undefined;
    this.lastEventCursor = undefined;
    this.activeAssistantId = undefined;
    this.toolNames.clear();
    this.ipythonExecutions.clear();
    if (selected) await this.request("detach", { activeSessionId: selected });
  }

  async close(): Promise<void> {
    this.closing = true;
    this.cancelReconnect();
    try { await this.detach(); } catch { /* The socket may already be gone; destroying it still owns cleanup. */ }
    this.socket?.destroy();
    this.socket = undefined;
  }

  private error(operation: string, message: string, cause?: unknown): SessionTranscriptStreamError {
    return new SessionTranscriptStreamError({ operation, message, ...(cause === undefined ? {} : { cause }) });
  }

  private resetTransport(operation: string, message: string): SessionTranscriptStreamError {
    this.hello = false;
    const socket = this.socket;
    this.socket = undefined;
    socket?.destroy();
    this.carry = Buffer.alloc(0);
    this.attaching = false;
    this.bufferedEvents = [];
    const error = this.error(operation, message);
    this.helloReject?.(error);
    this.helloReject = undefined;
    this.helloResolve = undefined;
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(error); }
    this.pending.clear();
    return error;
  }

  private onTransportFailure(operation: string, message: string): void {
    this.resetTransport(operation, message);
    if (this.selected && !this.closing) this.scheduleReconnect();
  }

  private terminalFailure(operation: string, message: string): void {
    this.resetTransport(operation, message);
    this.cancelReconnect();
    const selected = this.selected;
    this.selected = undefined;
    this.lastEventCursor = undefined;
    this.activeAssistantId = undefined;
    this.toolNames.clear();
    this.ipythonExecutions.clear();
    if (selected) this.publish({ kind: "closed", activeSessionId: selected });
  }

  private scheduleReconnect(): void {
    if (this.reconnectScheduledEpoch !== undefined || !this.selected || this.closing) return;
    this.reconnectScheduledEpoch = this.selectionEpoch;
    this.publish({ kind: "connection", activeSessionId: this.selected, state: "reconnecting" });
    Queue.offerUnsafe(this.reconnectSignals, undefined);
  }

  private cancelReconnect(): void {
    this.selectionEpoch += 1;
    this.reconnectScheduledEpoch = undefined;
  }

  reconnect(): Effect.Effect<void> {
    const connection = this;
    return Effect.gen(function* () {
      const epoch = connection.reconnectScheduledEpoch;
      const selected = connection.selected;
      if (epoch === undefined || !selected || connection.closing || connection.selectionEpoch !== epoch) {
        if (connection.reconnectScheduledEpoch === epoch) connection.reconnectScheduledEpoch = undefined;
        return;
      }
      for (const delayMs of connection.options.reconnectDelaysMs) {
        yield* Effect.sleep(Math.max(0, delayMs));
        if (connection.closing || connection.selected !== selected || connection.selectionEpoch !== epoch) {
          if (connection.reconnectScheduledEpoch === epoch) connection.reconnectScheduledEpoch = undefined;
          return;
        }
        const recovered = yield* Effect.tryPromise({
          try: () => connection.connect().then(async () => {
            if (connection.closing || connection.selected !== selected || connection.selectionEpoch !== epoch) return false;
            await connection.attachSelected(true, epoch);
            return true;
          }),
          catch: (cause) => connection.error("reconnect", "Daemon reconnect attempt failed", cause),
        }).pipe(Effect.catch(() => Effect.succeed(false)));
        if (!recovered) continue;
        if (connection.reconnectScheduledEpoch === epoch) connection.reconnectScheduledEpoch = undefined;
        connection.publish({ kind: "connection", activeSessionId: selected, state: "connected" });
        return;
      }
      if (!connection.closing && connection.selected === selected && connection.selectionEpoch === epoch) {
        connection.terminalFailure("reconnect", "Unable to reconnect to the Prime Agent daemon");
      }
      if (connection.reconnectScheduledEpoch === epoch) connection.reconnectScheduledEpoch = undefined;
    });
  }

  private observeCursor(cursor: { readonly generation: string; readonly sequence: number }): void {
    const current = this.lastEventCursor;
    if (!current || current.generation !== cursor.generation || cursor.sequence > current.sequence) this.lastEventCursor = cursor;
  }

  private request(command: "attach" | "detach", body: RecordValue): Promise<unknown> {
    if (!this.hello || !this.socket || this.socket.destroyed) return Promise.reject(this.error(command, "Prime Agent daemon is not connected"));
    const id = `ernie-transcript-${++this.requestId}`;
    const commandBody = { id, type: command, ...body };
    const envelope = { type: "command", id, protocol: PROTOCOL, clientId: this.clientId, command: commandBody };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.onTransportFailure(command, `${command} timed out`);
      }, this.options.requestTimeoutMs);
      this.pending.set(id, { command, resolve, reject, timeout });
      this.socket?.write(`${JSON.stringify(envelope)}\n`, "utf8", (cause) => {
        if (!cause) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timeout); this.pending.delete(id); pending.reject(this.error(command, `Unable to send ${command}`, cause));
      });
    });
  }

  private publish(event: SessionTranscriptEvent): void {
    if (this.attaching && event.kind !== "snapshot") {
      if (this.bufferedEvents.length >= this.options.maxBufferedEvents) {
        this.onTransportFailure("buffer", "Daemon event buffer exceeded the safe limit");
        return;
      }
      this.bufferedEvents.push(event);
      return;
    }
    Queue.offerUnsafe(this.eventsQueue, event);
  }

  private onChunk(chunk: Buffer): void {
    const combined = this.carry.length === 0 ? chunk : Buffer.concat([this.carry, chunk]);
    if (combined.length > this.options.maxLineBytes && !combined.includes(0x0a)) { this.terminalFailure("framing", "Daemon record exceeded the safe size limit"); return; }
    let offset = 0;
    while (offset < combined.length) {
      const newline = combined.indexOf(0x0a, offset);
      if (newline < 0) break;
      const line = combined.subarray(offset, newline); offset = newline + 1;
      if (line.length > this.options.maxLineBytes) { this.terminalFailure("framing", "Daemon record exceeded the safe size limit"); return; }
      if (line.length > 0) this.onLine(line);
    }
    this.carry = Buffer.from(combined.subarray(offset));
  }

  private onLine(line: Buffer): void {
    let unknown: unknown;
    try { unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line)) as unknown; }
    catch { this.terminalFailure("parse", "Daemon sent an invalid record"); return; }
    const message = record(unknown);
    if (!message) { this.terminalFailure("parse", "Daemon sent an invalid envelope"); return; }
    const type = requiredString(message["type"]);
    if (!this.hello) {
      const protocol = record(message["protocol"]);
      const capabilities = message["serverCapabilities"];
      if (type !== "daemon_hello" || protocol?.["name"] !== PROTOCOL.name || protocol["version"] !== PROTOCOL.version || !Array.isArray(capabilities) || !capabilities.includes("attach_snapshot") || !capabilities.includes("event_sequence")) {
        this.terminalFailure("handshake", "Unsupported Prime Agent daemon protocol"); return;
      }
      this.hello = true; this.helloResolve?.(); this.helloResolve = undefined; this.helloReject = undefined; return;
    }
    if (type === "response") { this.onResponse(message); return; }
    if (type === "session_event") this.onSessionEvent(message);
    else if (type === "session_closed" && requiredString(message["activeSessionId"]) === this.selected) {
      const selected = this.selected;
      this.cancelReconnect();
      this.selected = undefined;
      this.lastEventCursor = undefined;
      this.publish({ kind: "closed", activeSessionId: selected });
    }
  }

  private onResponse(message: RecordValue): void {
    const id = requiredString(message["id"]); if (!id) return;
    const pending = this.pending.get(id); if (!pending) return;
    if (message["command"] !== pending.command || typeof message["success"] !== "boolean") { this.terminalFailure(pending.command, "Malformed daemon response"); return; }
    clearTimeout(pending.timeout); this.pending.delete(id);
    if (!message["success"]) { pending.reject(this.error(pending.command, `Daemon rejected ${pending.command}`)); return; }
    pending.resolve(message["data"]);
  }

  private onSessionEvent(message: RecordValue): void {
    const activeSessionId = requiredString(message["activeSessionId"]) ?? requiredString(record(message["meta"])?.["activeSessionId"]);
    if (!activeSessionId || activeSessionId !== this.selected) return;
    const cursor = eventCursor(record(message["meta"])?.["cursor"]) ?? eventCursor(message["cursor"]);
    const current = this.lastEventCursor;
    if (cursor && current && !this.attaching) {
      if (cursor.generation !== current.generation || cursor.sequence > current.sequence + 1) {
        this.onTransportFailure("cursor", "Daemon event cursor changed unexpectedly");
        return;
      }
      if (cursor.sequence <= current.sequence) return;
    }
    if (cursor) this.observeCursor(cursor);
    const event = record(message["event"]); if (!event) return;
    const type = requiredString(event["type"]);
    if (type === "message_start") {
      const msg = record(event["message"]);
      if (msg?.["role"] !== "assistant") return;
      this.activeAssistantId = messageId(msg, `live:${++this.assistantSequence}`);
      this.publish({ kind: "assistant_start", activeSessionId, messageId: this.activeAssistantId });
      return;
    }
    if (type === "message_update") {
      const delta = record(event["assistantMessageEvent"]);
      if (delta?.["type"] !== "text_delta" || typeof delta["delta"] !== "string") return;
      const contentIndex = nonNegativeInteger(delta["contentIndex"]); if (contentIndex === null) return;
      const id = this.activeAssistantId ?? `live:${++this.assistantSequence}`;
      if (!this.activeAssistantId) { this.activeAssistantId = id; this.publish({ kind: "assistant_start", activeSessionId, messageId: id }); }
      this.publish({ kind: "assistant_delta", activeSessionId, messageId: id, contentIndex, delta: delta["delta"] });
      return;
    }
    if (type === "message_end") {
      const msg = record(event["message"]); if (!msg) return;
      if (msg["role"] === "assistant") {
        const id = this.activeAssistantId ?? messageId(msg, `live:${++this.assistantSequence}`);
        this.publish({ kind: "assistant_end", activeSessionId, messageId: id, blocks: textBlocks(msg) }); this.activeAssistantId = undefined;
      } else if (msg["role"] === "user") {
        this.publish({ kind: "user_message", activeSessionId, message: { kind: "message", messageId: messageId(msg, `live:${++this.assistantSequence}`), role: "user", blocks: textBlocks(msg) } });
      }
      return;
    }
    if (type === "tool_execution_start" || type === "tool_execution_update" || type === "tool_execution_end") {
      const callId = requiredString(event["toolCallId"]); if (!callId) return;
      const phase = type.endsWith("start") ? "start" : type.endsWith("update") ? "update" : "end";
      const reported = safeToolName(event["toolName"]);
      const name = reported === "tool" ? (this.toolNames.get(callId) ?? reported) : reported;
      if (phase === "end") this.toolNames.delete(callId); else this.toolNames.set(callId, name);
      const payload = phase === "start" ? event["args"] : phase === "update" ? event["partialResult"] : event["result"];
      const details = record(record(payload)?.["details"]);
      const toolStatus = phase === "end" ? status(details?.["status"], event["isError"] === true) : "running";
      let execution: SessionTranscriptTool["execution"];
      let detail = phase === "end" ? (toolStatus === "succeeded" ? "Succeeded" : toolStatus === "failed" ? "Failed" : "Aborted") : "Running";
      const previous = this.ipythonExecutions.get(callId);
      if (name === "ipython" || previous) {
        const observedAt = Date.now();
        const monotonicObservedAt = performance.now();
        const nextDetail = resultDetail(payload) || previous?.detail || "";
        const active = previous ?? {
          code: typeof record(payload)?.["code"] === "string" ? String(record(payload)?.["code"]).slice(0, 32_000) : "",
          detail: nextDetail,
          startedAt: observedAt,
          monotonicStartedAt: monotonicObservedAt,
        };
        const updated = { ...active, detail: nextDetail };
        detail = nextDetail;
        execution = { executionTarget: "unknown", status: toolStatus, code: updated.code, detail, startedAt: updated.startedAt, durationMs: phase === "end" ? Math.max(0, monotonicObservedAt - updated.monotonicStartedAt) : null };
        if (phase === "end") this.ipythonExecutions.delete(callId); else this.ipythonExecutions.set(callId, updated);
      }
      this.publish({ kind: "tool", activeSessionId, callId, name, phase, status: toolStatus, detail, ipython: name === "ipython", ...(execution ? { execution } : {}) });
    }
  }
}

/** Constructs the scoped daemon transcript service. */
export const make = (options: SessionTranscriptStreamOptions = {}) => Effect.acquireRelease(
  Effect.gen(function* () {
    const eventsQueue = yield* Queue.unbounded<SessionTranscriptEvent>();
    const reconnectSignals = yield* Queue.bounded<void>(1);
    const configuredDelays = options.reconnectDelaysMs?.filter((delay) => Number.isSafeInteger(delay) && delay >= 0).slice(0, 16);
    const connection = new Connection({
      socketPath: options.socketPath ?? defaultSessionTranscriptSocketPath(),
      maxLineBytes: options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES,
      maxHistoryItems: options.maxHistoryItems ?? DEFAULT_MAX_HISTORY_ITEMS,
      requestTimeoutMs: options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
      reconnectDelaysMs: configuredDelays ?? [100, 250, 500, 1_000, 2_000, 5_000],
      maxBufferedEvents: options.maxBufferedEvents && Number.isSafeInteger(options.maxBufferedEvents)
        ? Math.max(1, Math.min(options.maxBufferedEvents, 16_384))
        : 2_048,
    }, eventsQueue, reconnectSignals);
    return connection;
  }),
  (connection) => Effect.promise(() => connection.close()),
).pipe(Effect.flatMap((connection) => Effect.gen(function* () {
  yield* Stream.fromQueue(connection.reconnectSignals).pipe(
    Stream.runForEach(() => connection.reconnect()),
    Effect.forkScoped,
  );
  const selectionLock = yield* Semaphore.make(1);
  const select = (activeSessionId: string) => selectionLock.withPermits(1)(Effect.tryPromise({
    try: () => connection.select(activeSessionId),
    catch: (cause) => cause instanceof SessionTranscriptStreamError ? cause : new SessionTranscriptStreamError({ operation: "select", message: "Unable to attach to the selected session", cause }),
  }));
  const detach = selectionLock.withPermits(1)(Effect.tryPromise({
    try: () => connection.detach(),
    catch: (cause) => cause instanceof SessionTranscriptStreamError ? cause : new SessionTranscriptStreamError({ operation: "detach", message: "Unable to detach the selected session", cause }),
  }));
  return SessionTranscriptStream.of({ select, detach, events: Stream.fromQueue(connection.eventsQueue) });
})));

/** Provides a scoped read-only daemon transcript service. */
export const layer = (options: SessionTranscriptStreamOptions = {}) => Layer.effect(SessionTranscriptStream, make(options));
