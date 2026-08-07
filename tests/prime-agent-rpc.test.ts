import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { join, resolve } from "node:path";
import type { AgentEvent } from "../src/shared/contract";
import { AgentCommandSchema } from "../src/main/IpcProtocol";
import { isIPythonToolName, PrimeAgentRpc, layer } from "../src/main/PrimeAgentRpc";

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
      yield* rpc.start;
      yield* Effect.sleep("100 millis");
      return yield* rpc.state;
    })), { ERNIE_FAKE_MODE: "unterminated" }));
    expect(state.connection).toBe("failed");
    expect(state.detail).toMatch(/unterminated|exited/i);
  });

  it("decodes execution target commands and rejects unknown targets", () => {
    expect(Schema.decodeUnknownSync(AgentCommandSchema)({ type: "set_execution_target", target: "modal" }))
      .toEqual({ type: "set_execution_target", target: "modal" });
    expect(() => Schema.decodeUnknownSync(AgentCommandSchema)({ type: "set_execution_target", target: "ssh" })).toThrow();
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
});
