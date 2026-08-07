import { createServer, type Socket } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import { SessionTranscriptStream, layer } from "../src/main/SessionTranscriptStream";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()?.(); });

async function fakeDaemon() {
  const directory = await mkdtemp(join(tmpdir(), "ernie-transcript-"));
  const socketPath = join(directory, "daemon.sock");
  const commands: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket); socket.once("close", () => sockets.delete(socket));
    socket.write(`${JSON.stringify({ type: "daemon_hello", protocol: { name: "prime-agent.daemon", version: 7 }, serverCapabilities: ["attach_snapshot", "event_sequence"] })}
`);
    let carry = "";
    socket.on("data", (chunk) => {
      carry += chunk.toString("utf8");
      for (;;) {
        const newline = carry.indexOf("\n"); if (newline < 0) break;
        const line = carry.slice(0, newline); carry = carry.slice(newline + 1);
        const envelope = JSON.parse(line) as { id: string; command: { type: string; activeSessionId?: string } };
        commands.push(envelope.command.type);
        if (envelope.command.type === "attach") {
          const activeSessionId = envelope.command.activeSessionId ?? "";
          socket.write(`${JSON.stringify({ type: "response", id: envelope.id, command: "attach", success: true, data: {
            activeSessionId, snapshot: { activeSessionId, messages: [
              { id: "u1", role: "user", content: [{ type: "text", text: "hello" }] },
              { id: "a1", role: "assistant", content: [{ type: "text", text: "earlier" }] },
            ] },
          } })}
`);
          setImmediate(() => {
            const send = (event: unknown) => socket.write(`${JSON.stringify({ type: "session_event", activeSessionId, event })}
`);
            send({ type: "message_start", message: { id: "a2", role: "assistant", content: [] } });
            send({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "live " } });
            send({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "answer" } });
            send({ type: "tool_execution_start", toolCallId: "ipy1", toolName: "ipython", args: { code: "print(1)", secret: "hidden" } });
            send({ type: "tool_execution_update", toolCallId: "ipy1", partialResult: { content: [{ type: "text", text: "running /Users/private/work" }] } });
            send({ type: "tool_execution_end", toolCallId: "ipy1", result: { content: [{ type: "text", text: "1" }], details: { status: "success" } }, isError: false });
            send({ type: "message_end", message: { id: "a2", role: "assistant", content: [{ type: "text", text: "live answer" }], thinking: "private", signature: "private" } });
          });
        } else if (envelope.command.type === "detach") {
          socket.write(`${JSON.stringify({ type: "response", id: envelope.id, command: "detach", success: true })}
`);
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
  cleanups.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  return { socketPath, commands, sockets };
}

describe("SessionTranscriptStream", () => {
  it("projects a snapshot and live assistant/tool/IPython events without raw payloads", async () => {
    const fake = await fakeDaemon();
    const events = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* SessionTranscriptStream;
      const fiber = yield* service.events.pipe(Stream.take(8), Stream.runCollect, Effect.forkScoped);
      yield* service.select("session-1");
      const collected = yield* Fiber.join(fiber);
      return collected;
    }).pipe(Effect.provide(layer({ socketPath: fake.socketPath })))));

    expect(events[0]).toMatchObject({ kind: "snapshot", activeSessionId: "session-1", items: [
      { kind: "message", role: "user", blocks: [{ text: "hello" }] },
      { kind: "message", role: "assistant", blocks: [{ text: "earlier" }] },
    ] });
    expect(events.filter((event) => event.kind === "assistant_delta").map((event) => event.delta).join(""))
      .toBe("live answer");
    const tools = events.filter((event) => event.kind === "tool");
    expect(tools.map((event) => [event.phase, event.name])).toEqual([["start", "ipython"], ["update", "ipython"], ["end", "ipython"]]);
    expect(tools[0]).toMatchObject({ ipython: true, execution: { code: "print(1)", status: "running" } });
    expect(tools[1]?.detail).toBe("running [path]");
    expect(JSON.stringify(events)).not.toContain("hidden");
    expect(JSON.stringify(events)).not.toContain("thinking");
    expect(JSON.stringify(events)).not.toContain("signature");
  });

  it("closes an unresponsive handshake socket before retry or scoped cleanup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ernie-transcript-timeout-"));
    const socketPath = join(directory, "daemon.sock");
    const sockets = new Set<Socket>();
    const server = createServer((socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
    try {
      await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const service = yield* SessionTranscriptStream;
        yield* Effect.flip(service.select("session-timeout"));
      }).pipe(Effect.provide(layer({ socketPath, requestTimeoutMs: 20 })))));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(sockets.size).toBe(0);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("sends only attach/detach and detaches before scoped socket cleanup", async () => {
    const fake = await fakeDaemon();
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const service = yield* SessionTranscriptStream;
      yield* service.select("session-1");
    }).pipe(Effect.provide(layer({ socketPath: fake.socketPath })))));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.commands).toEqual(["attach", "detach"]);
    expect(fake.sockets.size).toBe(0);
  });
});
