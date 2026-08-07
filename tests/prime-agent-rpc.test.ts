import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { join, resolve } from "node:path";
import type { AgentEvent } from "../src/shared/contract";
import { PrimeAgentRpc, layer } from "../src/main/PrimeAgentRpc";

const root = resolve(import.meta.dirname, "..");
const options = (environment?: Readonly<Record<string, string>>) => ({
  nodePath: join(root, "assets/runtime/node"),
  cliPath: join(root, "tests/fake-prime-agent.mjs"),
  projectPath: root,
  ...(environment ? { environment } : {}),
});

const provideRpc = <A, E>(effect: Effect.Effect<A, E, PrimeAgentRpc>, environment?: Readonly<Record<string, string>>) =>
  effect.pipe(Effect.provide(layer(options(environment))));

describe("PrimeAgentRpc", () => {
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
    expect(result.events.find((event) => event.kind === "assistant_delta")).toMatchObject({ delta: "A".repeat(5_000) });
    expect(result.events.filter((event) => event.kind === "tool").map((event) => event.phase)).toEqual(["start", "update", "end"]);
    expect(result.events.filter((event) => event.kind === "lifecycle").map((event) => event.type)).toEqual(expect.arrayContaining(["agent_start", "agent_end"]));
    expect(result.state.isStreaming).toBe(false);
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
});
