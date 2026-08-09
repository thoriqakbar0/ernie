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

  it("recovers the selected session when the first daemon connection closes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ernie-transcript-initial-reconnect-"));
    const socketPath = join(directory, "daemon.sock");
    const sockets = new Set<Socket>();
    let connectionCount = 0;
    const server = createServer((socket) => {
      const connection = ++connectionCount;
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
      if (connection === 1) { socket.destroy(); return; }
      socket.write(`${JSON.stringify({ type: "daemon_hello", protocol: { name: "prime-agent.daemon", version: 7 }, serverCapabilities: ["attach_snapshot", "event_sequence"] })}\n`);
      socket.once("data", (chunk) => {
        const envelope = JSON.parse(chunk.toString("utf8").trim()) as { readonly id: string; readonly command: { readonly activeSessionId?: string } };
        const activeSessionId = envelope.command.activeSessionId ?? "";
        socket.write(`${JSON.stringify({ type: "response", id: envelope.id, command: "attach", success: true, data: {
          activeSessionId, snapshot: { activeSessionId, messages: [] },
        } })}\n`);
      });
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
    try {
      const events = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const service = yield* SessionTranscriptStream;
        const fiber = yield* service.events.pipe(Stream.take(3), Stream.runCollect, Effect.forkScoped);
        yield* Effect.flip(service.select("session-initial-reconnect"));
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(layer({ socketPath, requestTimeoutMs: 100, reconnectDelaysMs: [1, 5] })))));

      expect(events.map((event) => event.kind)).toEqual(["connection", "snapshot", "connection"]);
      expect(events[0]).toMatchObject({ activeSessionId: "session-initial-reconnect", state: "reconnecting" });
      expect(events[2]).toMatchObject({ activeSessionId: "session-initial-reconnect", state: "connected" });
      expect(connectionCount).toBe(2);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("closes the connection after a malformed successful attach snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ernie-transcript-malformed-"));
    const socketPath = join(directory, "daemon.sock");
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket); socket.once("close", () => sockets.delete(socket));
      socket.write(`${JSON.stringify({ type: "daemon_hello", protocol: { name: "prime-agent.daemon", version: 7 }, serverCapabilities: ["attach_snapshot", "event_sequence"] })}
`);
      socket.once("data", (chunk) => {
        const envelope = JSON.parse(chunk.toString("utf8").trim()) as { id: string };
        socket.write(`${JSON.stringify({ type: "response", id: envelope.id, command: "attach", success: true, data: { activeSessionId: "wrong-session", snapshot: {} } })}
`);
      });
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
    try {
      await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const service = yield* SessionTranscriptStream;
        yield* Effect.flip(service.select("expected-session"));
      }).pipe(Effect.provide(layer({ socketPath })))));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(sockets.size).toBe(0);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });


  it("reattaches with the last event cursor after a transient daemon disconnect", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ernie-transcript-reconnect-"));
    const socketPath = join(directory, "daemon.sock");
    const sockets = new Set<Socket>();
    const attachCommands: Array<{ readonly activeSessionId?: string; readonly resumeCursor?: { readonly generation?: string; readonly sequence?: number } }> = [];
    const clientIds: string[] = [];
    let connectionCount = 0;
    let resolveFinalSocketClosed: (() => void) | undefined;
    const finalSocketClosed = new Promise<void>((resolve) => { resolveFinalSocketClosed = resolve; });
    const server = createServer((socket) => {
      connectionCount += 1;
      const connection = connectionCount;
      sockets.add(socket); socket.once("close", () => { sockets.delete(socket); if (connection === 2) resolveFinalSocketClosed?.(); });
      socket.write(`${JSON.stringify({ type: "daemon_hello", protocol: { name: "prime-agent.daemon", version: 7 }, serverCapabilities: ["attach_snapshot", "event_sequence"] })}\n`);
      let carry = "";
      socket.on("data", (chunk) => {
        carry += chunk.toString("utf8");
        for (;;) {
          const newline = carry.indexOf("\n"); if (newline < 0) break;
          const line = carry.slice(0, newline); carry = carry.slice(newline + 1);
          const envelope = JSON.parse(line) as { readonly id: string; readonly clientId?: string; readonly command: { readonly type: string; readonly activeSessionId?: string; readonly resumeCursor?: { readonly generation?: string; readonly sequence?: number } } };
          if (envelope.command.type !== "attach") continue;
          attachCommands.push(envelope.command);
          if (envelope.clientId) clientIds.push(envelope.clientId);
          const activeSessionId = envelope.command.activeSessionId ?? "";
          socket.write(`${JSON.stringify({ type: "response", id: envelope.id, command: "attach", success: true, data: {
            activeSessionId,
            snapshot: { activeSessionId, messages: [], lastEventCursor: { generation: "generation-1", sequence: connection === 1 ? 1 : 2 } },
            lastEventCursor: { generation: "generation-1", sequence: connection === 1 ? 1 : 2 },
            replay: { status: connection === 1 ? "complete" : "unavailable", toSequence: connection === 1 ? 1 : 2, ...(connection === 1 ? {} : { reason: "event_replay_not_available" }) },
          } })}\n`);
          setImmediate(() => {
            const sequence = connection === 1 ? 2 : 3;
            socket.write(`${JSON.stringify({ type: "session_event", activeSessionId, meta: { cursor: { generation: "generation-1", sequence } }, event: {
              type: "message_end", message: { id: connection === 1 ? "before-reconnect" : "after-reconnect", role: "user", content: [{ type: "text", text: connection === 1 ? "before" : "after" }] },
            } })}\n`);
            if (connection === 1) setImmediate(() => socket.destroy());
          });
        }
      });
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
    try {
      const events = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const service = yield* SessionTranscriptStream;
        const fiber = yield* service.events.pipe(Stream.take(6), Stream.runCollect, Effect.forkScoped);
        yield* service.select("session-reconnect");
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(layer({ socketPath, requestTimeoutMs: 200, reconnectDelaysMs: [1, 5, 10] })))));

      const kinds = events.map((event) => event.kind);
      expect(kinds.slice(0, 3)).toEqual(["snapshot", "user_message", "connection"]);
      expect(kinds.slice(3).toSorted()).toEqual(["connection", "snapshot", "user_message"]);
      expect(events.filter((event) => event.kind === "connection").map((event) => event.state)).toEqual(["reconnecting", "connected"]);
      expect(events.some((event) => event.kind === "closed")).toBe(false);
      expect(attachCommands).toHaveLength(2);
      expect(new Set(clientIds).size).toBe(1);
      expect(attachCommands[1]?.resumeCursor).toEqual({ activeSessionId: "session-reconnect", generation: "generation-1", sequence: 2 });
      await finalSocketClosed;
      expect(sockets.size).toBe(0);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("supersedes an in-flight reconnect handshake when the selected session changes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ernie-transcript-reconnect-race-"));
    const socketPath = join(directory, "daemon.sock");
    const sockets = new Set<Socket>();
    const connections = new Map<number, Socket>();
    let connectionCount = 0;
    let releaseStalledReconnect: (() => void) | undefined;
    const stalledReconnect = new Promise<void>((resolve) => { releaseStalledReconnect = resolve; });
    const server = createServer((socket) => {
      const connection = ++connectionCount;
      sockets.add(socket);
      connections.set(connection, socket);
      socket.once("close", () => sockets.delete(socket));
      if (connection === 2) { releaseStalledReconnect?.(); return; }
      socket.write(`${JSON.stringify({ type: "daemon_hello", protocol: { name: "prime-agent.daemon", version: 7 }, serverCapabilities: ["attach_snapshot", "event_sequence"] })}\n`);
      let carry = "";
      socket.on("data", (chunk) => {
        carry += chunk.toString("utf8");
        for (;;) {
          const newline = carry.indexOf("\n"); if (newline < 0) break;
          const line = carry.slice(0, newline); carry = carry.slice(newline + 1);
          const envelope = JSON.parse(line) as { readonly id: string; readonly command: { readonly type: string; readonly activeSessionId?: string } };
          if (envelope.command.type === "detach") {
            socket.write(`${JSON.stringify({ type: "response", id: envelope.id, command: "detach", success: true })}\n`);
            continue;
          }
          if (envelope.command.type !== "attach") continue;
          const activeSessionId = envelope.command.activeSessionId ?? "";
          socket.write(`${JSON.stringify({ type: "response", id: envelope.id, command: "attach", success: true, data: {
            activeSessionId, snapshot: { activeSessionId, messages: [] },
          } })}\n`);
          if (connection === 1) setImmediate(() => socket.destroy());
        }
      });
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
    try {
      const run = Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const service = yield* SessionTranscriptStream;
        const fiber = yield* service.events.pipe(Stream.take(6), Stream.runCollect, Effect.forkScoped);
        yield* service.select("session-before-race");
        yield* Effect.promise(() => stalledReconnect);
        yield* service.select("session-after-race");
        connections.get(3)?.destroy();
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(layer({ socketPath, requestTimeoutMs: 500, reconnectDelaysMs: [1, 5, 10] })))));
      const events = await Promise.race([
        run,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("reconnect race timed out")), 1_500)),
      ]);
      expect(events.filter((event) => event.kind === "snapshot").map((event) => event.activeSessionId))
        .toEqual(["session-before-race", "session-after-race", "session-after-race"]);
      expect(events.at(-1)).toMatchObject({ kind: "connection", activeSessionId: "session-after-race", state: "connected" });
      expect(connectionCount).toBe(4);
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
