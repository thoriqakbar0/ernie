import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { join, resolve } from "node:path";
import type { AgentEvent } from "../src/shared/contract";
import { AgentCommandSchema, StartSpaceSchema } from "../src/main/IpcProtocol";
import { isIPythonToolName, makeScoped, PrimeAgentRpc, layer } from "../src/main/PrimeAgentRpc";

const root = resolve(import.meta.dirname, "..");
const options = (environment?: Readonly<Record<string, string>>) => ({
  nodePath: join(root, "assets/runtime/node"),
  cliPath: join(root, "tests/fake-prime-agent.mjs"),
  projectPath: root,
  remoteExtensionPath: join(root, "resources", "remote"),
  ...(environment ? { environment } : {}),
});

const provideRpc = <A, E>(effect: Effect.Effect<A, E, PrimeAgentRpc>, environment?: Readonly<Record<string, string>>) =>
  effect.pipe(Effect.provide(layer(options(environment))));

describe("PrimeAgentRpc", () => {
  it("recognizes only the built-in IPython tool identity", () => {
    expect(isIPythonToolName("ipython")).toBe(true);
    expect(isIPythonToolName("IPython")).toBe(false);
    expect(isIPythonToolName("python")).toBe(false);
    expect(isIPythonToolName("functions.ipython")).toBe(false);
  });

  it("handshakes with the pinned runtime and publishes normalized state", async () => {
    const result = await Effect.runPromise(provideRpc(Effect.scoped(Effect.gen(function* () {
      const rpc = yield* PrimeAgentRpc;
      yield* rpc.start;
      return yield* rpc.state;
    }))));
    expect(result.connection).toBe("ready");
    expect(result.sessionId).toBe("bridge-test-session");
    expect(result.modelName).toBe("Test Model");
    expect(result.contextWindow).toBe(200_000);
    expect(result.totalTokens).toBe(2_345);
    expect(result.cost).toBe("$0.0123");
  });

  it("stops the entire RPC process group so agent descendants cannot leak", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ernie-process-tree-"));
    const pidFile = join(directory, "descendant.pid");
    let descendantPid: number | undefined;
    try {
      await Effect.runPromise(provideRpc(Effect.scoped(Effect.gen(function* () {
        const rpc = yield* PrimeAgentRpc;
        yield* rpc.start;
        const pid = Number.parseInt(yield* Effect.promise(() => readFile(pidFile, "utf8")), 10);
        descendantPid = pid;
        process.kill(pid, 0);
        yield* rpc.stop;
        yield* Effect.sleep("100 millis");
        expect(() => process.kill(pid, 0)).toThrow();
      })), { ERNIE_FAKE_DESCENDANT_PID_FILE: pidFile }));
    } finally {
      if (descendantPid !== undefined) {
        try { process.kill(descendantPid, "SIGKILL"); }
        catch (cause) { if (!(cause instanceof Error && "code" in cause && cause.code === "ESRCH")) throw cause; }
      }
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves event order, streaming behavior, text, tools, and lifecycle state", async () => {
    const result = await Effect.runPromise(provideRpc(Effect.scoped(Effect.gen(function* () {
      const rpc = yield* PrimeAgentRpc;
      yield* rpc.start;
      const events: AgentEvent[] = [];
      yield* Effect.forkScoped(Stream.runForEach(rpc.events, (event) => Effect.sync(() => { events.push(event); })));
      yield* rpc.command({ type: "prompt", message: "hello", behavior: "followUp" });
      yield* Effect.sleep("100 millis");
      return { events, state: yield* rpc.state };
    })), { ERNIE_FAKE_MODE: "lifecycle" }));

    const raw = result.events.find((event) => event.kind === "raw" && (event.event as { type?: string }).type === "fake_prompt_received");
    expect(raw).toMatchObject({ kind: "raw", event: { streamingBehavior: "followUp" } });
    const deltas = result.events.filter((event) => event.kind === "assistant_delta");
    expect(deltas.map((event) => event.delta).join("")).toBe("A".repeat(5_000));
    expect(new Set(deltas.map((event) => event.messageId))).toEqual(new Set(["m:1"]));
    const messages = result.events.filter((event) => event.kind === "assistant_message");
    expect(messages.map((event) => [event.phase, event.messageId])).toEqual([
      ["start", "m:1"], ["end", "m:1"], ["start", "m:2"], ["end", "m:2"],
    ]);
    expect(messages.at(-1)).toMatchObject({ phase: "end", blocks: [{ contentIndex: 0, text: "done" }] });
    expect(result.events.findIndex((event) => event.kind === "assistant_message" && event.phase === "end" && event.messageId === "m:1"))
      .toBeLessThan(result.events.findIndex((event) => event.kind === "tool" && event.phase === "start"));
    const toolEvents = result.events.filter((event) => event.kind === "tool");
    expect(toolEvents.filter((event) => event.name === "read").map((event) => event.phase)).toEqual(["start", "update", "end"]);
    expect(toolEvents.filter((event) => event.name === "read").every((event) => event.ipython === undefined)).toBe(true);
    expect(toolEvents.filter((event) => event.name === "ipython").map((event) => event.phase)).toEqual(["start", "update", "end"]);
    expect(toolEvents.filter((event) => event.name === "ipython").every((event) => event.ipython?.executionTarget === "local")).toBe(true);
    expect(result.events.filter((event) => event.kind === "delegation").map((event) => [event.status, event.childId])).toEqual([
      ["running", "sub-1"], ["done", "sub-1"],
    ]);
    expect(result.events.filter((event) => event.kind === "lifecycle").map((event) => event.type)).toEqual(expect.arrayContaining(["agent_start", "agent_end"]));
    expect(result.state.isStreaming).toBe(false);
  });

  it("closes an interrupted message before the next agent run starts", async () => {
    const events = await Effect.runPromise(provideRpc(Effect.scoped(Effect.gen(function* () {
      const rpc = yield* PrimeAgentRpc;
      yield* rpc.start;
      const captured: AgentEvent[] = [];
      yield* Effect.forkScoped(Stream.runForEach(rpc.events, (event) => Effect.sync(() => { captured.push(event); })));
      yield* rpc.command({ type: "prompt", message: "hello" });
      yield* Effect.sleep("50 millis");
      return captured;
    })), { ERNIE_FAKE_MODE: "missing-message-end" }));

    expect(events.filter((event) => event.kind === "assistant_message").map((event) => [event.phase, event.messageId])).toEqual([
      ["start", "m:1"], ["end", "m:1"], ["start", "m:2"], ["end", "m:2"],
    ]);
    expect(events.some((event) => event.kind === "error" && event.source === "protocol")).toBe(false);
  });

  it("rejects malformed content indexes instead of merging them into the first text block", async () => {
    const events = await Effect.runPromise(provideRpc(Effect.scoped(Effect.gen(function* () {
      const rpc = yield* PrimeAgentRpc;
      yield* rpc.start;
      const captured: AgentEvent[] = [];
      yield* Effect.forkScoped(Stream.runForEach(rpc.events, (event) => Effect.sync(() => { captured.push(event); })));
      yield* rpc.command({ type: "prompt", message: "hello" });
      yield* Effect.sleep("50 millis");
      return captured;
    })), { ERNIE_FAKE_MODE: "invalid-index" }));

    expect(events.some((event) => event.kind === "assistant_delta")).toBe(false);
    expect(events.find((event) => event.kind === "error")).toMatchObject({ source: "protocol", message: expect.stringMatching(/content index/i) });
  });

  it("fails closed when stdout ends with an unterminated record", async () => {
    const state = await Effect.runPromise(provideRpc(Effect.scoped(Effect.gen(function* () {
      const rpc = yield* PrimeAgentRpc;
      yield* rpc.start.pipe(Effect.ignore);
      yield* Effect.sleep("100 millis");
      return yield* rpc.state;
    })), { ERNIE_FAKE_MODE: "unterminated" }));
    expect(["failed", "closed"]).toContain(state.connection);
    expect(state.detail).toMatch(/unterminated|exited|stopped/i);
  });

  it("decodes execution target commands and rejects unknown targets", () => {
    expect(Schema.decodeUnknownSync(AgentCommandSchema)({ type: "set_execution_target", target: "modal" }))
      .toEqual({ type: "set_execution_target", target: "modal" });
    expect(() => Schema.decodeUnknownSync(AgentCommandSchema)({ type: "set_execution_target", target: "ssh" })).toThrow();
  });

  it("decodes bounded start configuration with a canonical thinking level", () => {
    const input = {
      spaceId: "space-a",
      prompt: "Start",
      model: { provider: "provider-a", id: "model-a" },
      thinkingLevel: "max",
      rlmMaxDepth: 3,
    };
    expect(Schema.decodeUnknownSync(StartSpaceSchema)(input)).toEqual(input);
    expect(() => Schema.decodeUnknownSync(StartSpaceSchema)({ ...input, thinkingLevel: "turbo" })).toThrow();
    expect(() => Schema.decodeUnknownSync(StartSpaceSchema)({ ...input, rlmMaxDepth: -1 })).toThrow();
  });

  it("restores the active execution target from the project-scoped remote config", async () => {
    const agentDirectory = await mkdtemp(join(tmpdir(), "ernie-prime-agent-"));
    try {
      await writeFile(join(agentDirectory, "remote.json"), JSON.stringify({
        version: 1,
        projects: {
          [root]: {
            provider: "modal",
            runtimeId: "modal-runtime",
            cwd: root,
            createdAt: new Date(0).toISOString(),
            active: true,
          },
        },
      }));
      const state = await Effect.runPromise(provideRpc(Effect.scoped(Effect.gen(function* () {
        const rpc = yield* PrimeAgentRpc;
        yield* rpc.start;
        return yield* rpc.state;
      })), { PRIME_AGENT_DIR: agentDirectory }));
      expect(state.executionTarget).toBe("modal");
      expect(state.switchingExecutionTo).toBeUndefined();
    } finally {
      await rm(agentDirectory, { recursive: true, force: true });
    }
  });

  it("starts and stops idempotently", async () => {
    const state = await Effect.runPromise(provideRpc(Effect.scoped(Effect.gen(function* () {
      const rpc = yield* PrimeAgentRpc;
      yield* rpc.start;
      yield* rpc.start;
      yield* rpc.stop;
      yield* rpc.stop;
      return yield* rpc.state;
    }))));
    expect(state.connection).toBe("closed");
  });

  it("configures a provider-qualified model before admitting the first prompt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ernie-rpc-order-"));
    const cliPath = join(directory, "fake.mjs");
    const logPath = join(directory, "requests.log");
    const source = `
import { appendFileSync } from "node:fs";
import process from "node:process";
let carry = "";
const model = { provider: "provider-a", id: "shared-id", name: "Qualified Model", reasoning: true, thinkingLevelMap: { minimal: null, xhigh: "max", max: "max" } };
const state = { sessionId: "owned", sessionName: "Owned", model, thinkingLevel: "xhigh", isStreaming: false, isCompacting: false, messageCount: 0, sessionActions: { queuedCount: 0 } };
const send = (request, data = {}) => process.stdout.write(JSON.stringify({ type: "response", id: request.id, command: request.type, success: true, data }) + "\\n");
function handle(request) {
  appendFileSync(process.env.REQUEST_LOG, request.type + "\\n");
  if (request.type === "get_state") return send(request, state);
  if (request.type === "get_session_stats") return send(request, { contextUsage: {}, tokens: {}, cost: 0 });
  if (request.type === "new_session") return send(request, { cancelled: false });
  if (request.type === "get_available_models") return send(request, { models: [model, { provider: "provider-b", id: "shared-id", name: "Other", reasoning: false }] });
  if (request.type === "set_model") return send(request, model);
  return send(request);
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { carry += chunk; for (;;) { const newline = carry.indexOf("\\n"); if (newline < 0) break; const line = carry.slice(0, newline); carry = carry.slice(newline + 1); if (line) handle(JSON.parse(line)); } });
`;
    try {
      await writeFile(cliPath, source);
      await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const rpc = yield* makeScoped({
          ...options({ REQUEST_LOG: logPath }),
          cliPath,
        });
        yield* rpc.start;
        expect(yield* rpc.availableModels).toEqual([
          { provider: "provider-a", id: "shared-id", name: "Qualified Model", thinkingLevels: ["off", "low", "medium", "high", "xhigh", "max"] },
          { provider: "provider-b", id: "shared-id", name: "Other", thinkingLevels: ["off"] },
        ]);
        yield* rpc.configureThenPrompt({
          message: "first",
          model: { provider: "provider-a", id: "shared-id" },
          thinkingLevel: "xhigh",
        });
        expect(yield* rpc.currentModel).toEqual({
          provider: "provider-a", id: "shared-id", name: "Qualified Model",
          thinkingLevels: ["off", "low", "medium", "high", "xhigh", "max"],
        });
        const unsupported = yield* rpc.configureThenPrompt({
          message: "must not run",
          model: { provider: "provider-a", id: "shared-id" },
          thinkingLevel: "minimal",
        }).pipe(Effect.flip);
        expect(unsupported).toMatchObject({ operation: "set_thinking_level" });
      })));
      const requests = (await readFile(logPath, "utf8")).trim().split("\n");
      expect(requests).toEqual(expect.arrayContaining(["new_session", "get_available_models", "set_model", "set_thinking_level", "prompt"]));
      expect(requests.indexOf("new_session")).toBeLessThan(requests.indexOf("set_model"));
      expect(requests.indexOf("set_model")).toBeLessThan(requests.indexOf("set_thinking_level"));
      expect(requests.indexOf("set_thinking_level")).toBeLessThan(requests.indexOf("prompt"));
      expect(requests.filter((request) => request === "set_thinking_level")).toHaveLength(1);
      expect(requests.filter((request) => request === "prompt")).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects invalid RLM depth locally without writing to the unsupported pinned protocol", async () => {
    await expect(Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const rpc = yield* makeScoped(options());
      yield* rpc.setRlmMaxDepth(-1);
    })))).rejects.toMatchObject({ operation: "set_rlm_max_depth" });
  });

});
