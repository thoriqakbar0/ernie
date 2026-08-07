import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type { AgentCommand, CommandResult } from "../shared/contract";
import { AgentCommandSchema } from "./IpcProtocol";
import { ErnieWindow, hardenElectron } from "./ErnieWindow";
import { PrimeAgentRpc } from "./PrimeAgentRpc";
import { WorkspaceCatalog } from "./WorkspaceCatalog";
import { DevServerCatalog } from "./DevServerCatalog";
import { SessionTranscriptStream } from "./SessionTranscriptStream";
import { ClipboardWriter } from "./ClipboardWriter";

const DevServerPortSchema = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_535 }));
const DevServerOpenSchema = Schema.Struct({ worktreeId: Schema.String, port: DevServerPortSchema, url: Schema.String });

export const program = Effect.scoped(Effect.gen(function* () {
  const rpc = yield* PrimeAgentRpc;
  const catalog = yield* WorkspaceCatalog;
  const devServers = yield* DevServerCatalog;
  const sessionTranscripts = yield* SessionTranscriptStream;
  const clipboard = yield* ClipboardWriter;
  const window = yield* ErnieWindow;
  yield* Effect.promise(() => app.whenReady());
  yield* hardenElectron;
  yield* window.create;
  yield* Effect.forkScoped(Stream.runForEach(rpc.events, window.send));
  yield* Effect.forkScoped(Stream.runForEach(sessionTranscripts.events, window.sendSessionTranscript));
  yield* Effect.forkScoped(Stream.runForEach(catalog.events, (event) => event.kind === "snapshot"
    ? window.send({ kind: "workspace", snapshot: event.snapshot })
    : window.send({ kind: "error", source: "workspace_catalog", message: event.message })));

  const runEffect = Effect.runPromise;
  const command = (input: AgentCommand) => rpc.command(input).pipe(
    Effect.map((result): CommandResult => ({ ok: true, ...result })),
    Effect.catch((error) => Effect.succeed({ ok: false, error: error.message } satisfies CommandResult)),
  );

  yield* Effect.acquireRelease(
    Effect.sync(() => {
      ipcMain.handle("agent:get-state", (event) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        return yield* rpc.state;
      })));
      ipcMain.handle("workspace:get-snapshot", (event) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        return yield* catalog.current;
      })));
      ipcMain.handle("agent:get-commands", (event) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        return yield* rpc.availableCommands;
      })));
      ipcMain.handle("session-transcript:select", (event, input: unknown) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        const activeSessionId = yield* Schema.decodeUnknownEffect(Schema.String)(input);
        const workspace = yield* catalog.current;
        const agent = workspace.agents.find((candidate) => candidate.id === activeSessionId && candidate.activeSessionId === activeSessionId);
        if (!agent) return yield* Effect.die(new Error("Unknown active session"));
        return yield* sessionTranscripts.select(activeSessionId);
      })));
      ipcMain.handle("session-transcript:detach", (event) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        yield* sessionTranscripts.detach;
      })));
      ipcMain.handle("dev-server:refresh", (event, worktreeId: unknown) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        const id = yield* Schema.decodeUnknownEffect(Schema.String)(worktreeId);
        const workspace = yield* catalog.current;
        const worktree = workspace.worktrees.find((candidate) => candidate.id === id);
        if (!worktree) return yield* Effect.die(new Error("Unknown worktree"));
        return yield* devServers.refresh(worktree.path);
      })));
      ipcMain.handle("dev-server:open", (event, input: unknown) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        const { worktreeId, port, url } = yield* Schema.decodeUnknownEffect(DevServerOpenSchema)(input);
        const workspace = yield* catalog.current;
        const worktree = workspace.worktrees.find((candidate) => candidate.id === worktreeId);
        if (!worktree) return { ok: false, error: "This worktree is no longer available." } satisfies CommandResult;
        const snapshot = yield* devServers.refresh(worktree.path);
        const server = snapshot.servers.find((candidate) => candidate.port === port && candidate.url === url);
        if (!server) return { ok: false, error: "The development server is no longer available in this worktree." } satisfies CommandResult;
        yield* Effect.tryPromise(() => shell.openExternal(server.url));
        return { ok: true } satisfies CommandResult;
      }).pipe(Effect.catch(() => Effect.succeed({ ok: false, error: "Unable to open the local development server." } satisfies CommandResult)))));
      ipcMain.handle("clipboard:write-text", (event, input: unknown) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        const text = yield* Schema.decodeUnknownEffect(Schema.String)(input);
        if (text.length > 524_288) return { ok: false, error: "Clipboard content is too large." } satisfies CommandResult;
        yield* clipboard.writeText(text);
        return { ok: true } satisfies CommandResult;
      }).pipe(Effect.catch(() => Effect.succeed({ ok: false, error: "Unable to copy text." } satisfies CommandResult)))));
      ipcMain.handle("agent:command", (event, input: unknown) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        const parsed = yield* Schema.decodeUnknownEffect(AgentCommandSchema)(input).pipe(
          Effect.mapError(() => ({ ok: false, error: "Invalid command" } as const)),
        );
        return yield* command(parsed);
      }).pipe(Effect.catch((result) => Effect.succeed(result)))));
    }),
    () => Effect.sync(() => {
      ipcMain.removeHandler("agent:get-state");
      ipcMain.removeHandler("workspace:get-snapshot");
      ipcMain.removeHandler("agent:get-commands");
      ipcMain.removeHandler("session-transcript:select");
      ipcMain.removeHandler("session-transcript:detach");
      ipcMain.removeHandler("dev-server:refresh");
      ipcMain.removeHandler("dev-server:open");
      ipcMain.removeHandler("clipboard:write-text");
      ipcMain.removeHandler("agent:command");
    }),
  );

  yield* Effect.forkScoped(rpc.start);
  yield* Effect.forkScoped(catalog.start.pipe(
    Effect.catch((error) => window.send({ kind: "error", source: "workspace_catalog", message: error.message })),
  ));

  let quitAllowed = false;
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      const activate = () => { if (BrowserWindow.getAllWindows().length === 0) void runEffect(window.create); };
      const allClosed = () => { if (process.platform !== "darwin") app.quit(); };
      const beforeQuit = (event: Electron.Event) => {
        if (quitAllowed) return;
        event.preventDefault();
        void runEffect(rpc.stop).finally(() => { quitAllowed = true; app.quit(); });
      };
      app.on("activate", activate);
      app.on("window-all-closed", allClosed);
      app.on("before-quit", beforeQuit);
      return { activate, allClosed, beforeQuit };
    }),
    ({ activate, allClosed, beforeQuit }) => Effect.sync(() => {
      app.removeListener("activate", activate);
      app.removeListener("window-all-closed", allClosed);
      app.removeListener("before-quit", beforeQuit);
    }),
  );

  yield* Effect.never;
})).pipe(Effect.withSpan("ErnieApp.program"));
