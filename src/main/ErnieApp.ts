import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type { CommandResult, OpenProjectResult } from "../shared/contract";
import { SpaceCommandSchema, SpaceIdSchema, StartSpaceSchema } from "./IpcProtocol";
import { ErnieWindow, hardenElectron } from "./ErnieWindow";
import { SpaceRuntimeRegistry } from "./SpaceRuntimeRegistry";
import { WorkspaceCatalog } from "./WorkspaceCatalog";
import { DevServerCatalog } from "./DevServerCatalog";
import { SessionTranscriptStream } from "./SessionTranscriptStream";
import { ClipboardWriter } from "./ClipboardWriter";
import { RendererPerformanceSampler } from "./RendererPerformanceSampler";

const DevServerPortSchema = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_535 }));
const DevServerOpenSchema = Schema.Struct({ worktreeId: Schema.String, port: DevServerPortSchema, url: Schema.String });

export const program = Effect.scoped(Effect.gen(function* () {
  const runtimes = yield* SpaceRuntimeRegistry;
  const catalog = yield* WorkspaceCatalog;
  const devServers = yield* DevServerCatalog;
  const sessionTranscripts = yield* SessionTranscriptStream;
  const clipboard = yield* ClipboardWriter;
  const window = yield* ErnieWindow;
  const rendererPerformance = new RendererPerformanceSampler({ read: () => app.getAppMetrics() });
  yield* Effect.promise(() => app.whenReady());
  yield* hardenElectron;
  yield* window.create;
  yield* Effect.forkScoped(Stream.runForEach(runtimes.events, window.sendSpace));
  yield* Effect.forkScoped(Stream.runForEach(sessionTranscripts.events, window.sendSessionTranscript));
  yield* Effect.forkScoped(Stream.runForEach(catalog.events, (event) => event.kind === "snapshot"
    ? window.sendWorkspace({ kind: "workspace", snapshot: event.snapshot })
    : window.sendWorkspace({ kind: "error", source: "workspace_catalog", message: event.message })));

  const runEffect = Effect.runPromise;
  const commandResult = <A extends { readonly cancelled?: boolean }>(effect: Effect.Effect<A, { readonly message: string }>) => effect.pipe(
    Effect.map((result): CommandResult => ({ ok: true, ...result })),
    Effect.catch((error) => Effect.succeed({ ok: false, error: error.message } satisfies CommandResult)),
  );

  yield* Effect.acquireRelease(
    Effect.sync(() => {
      ipcMain.handle("space:get-state", (event, input: unknown) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        return yield* runtimes.state(yield* Schema.decodeUnknownEffect(SpaceIdSchema)(input));
      })));
      ipcMain.handle("space:get-commands", (event, input: unknown) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        return yield* runtimes.availableCommands(yield* Schema.decodeUnknownEffect(SpaceIdSchema)(input));
      })));
      ipcMain.handle("space:get-models", (event, input: unknown) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        return yield* runtimes.availableModels(yield* Schema.decodeUnknownEffect(SpaceIdSchema)(input));
      })));
      ipcMain.handle("space:get-rlm-max-depth", (event, input: unknown) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        return yield* runtimes.getRlmMaxDepth(yield* Schema.decodeUnknownEffect(SpaceIdSchema)(input));
      })));
      ipcMain.handle("space:start", (event, input: unknown) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        const parsed = yield* Schema.decodeUnknownEffect(StartSpaceSchema)(input);
        return yield* commandResult(runtimes.startSpace(parsed).pipe(Effect.as({})));
      }).pipe(Effect.catch(() => Effect.succeed({ ok: false, error: "Invalid Space start request" } satisfies CommandResult)))));
      ipcMain.handle("space:command", (event, input: unknown) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        const parsed = yield* Schema.decodeUnknownEffect(SpaceCommandSchema)(input);
        return yield* commandResult(runtimes.command(parsed.spaceId, parsed.command));
      }).pipe(Effect.catch(() => Effect.succeed({ ok: false, error: "Invalid Space command" } satisfies CommandResult)))));
      ipcMain.handle("workspace:get-snapshot", (event) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        return yield* catalog.current;
      })));
      ipcMain.handle("workspace:open-project", (event) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        const selection = yield* Effect.promise(() => dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] }));
        const selected = selection.filePaths[0];
        if (selection.canceled || selected === undefined) return { ok: true, cancelled: true } satisfies OpenProjectResult;
        return yield* catalog.addProject(selected).pipe(
          Effect.map((snapshot) => ({ ok: true, cancelled: false, snapshot } satisfies OpenProjectResult)),
          Effect.catch((error) => Effect.succeed({ ok: false, error: error.message } satisfies OpenProjectResult)),
        );
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
      ipcMain.handle("performance:renderer-sample", (event) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        return rendererPerformance.sample(event.sender.getOSProcessId());
      })));
      ipcMain.handle("clipboard:write-text", (event, input: unknown) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        const text = yield* Schema.decodeUnknownEffect(Schema.String)(input);
        if (text.length > 524_288) return { ok: false, error: "Clipboard content is too large." } satisfies CommandResult;
        yield* clipboard.writeText(text);
        return { ok: true } satisfies CommandResult;
      }).pipe(Effect.catch(() => Effect.succeed({ ok: false, error: "Unable to copy text." } satisfies CommandResult)))));
    }),
    () => Effect.sync(() => {
      ipcMain.removeHandler("space:get-state");
      ipcMain.removeHandler("space:get-commands");
      ipcMain.removeHandler("space:get-models");
      ipcMain.removeHandler("space:get-rlm-max-depth");
      ipcMain.removeHandler("space:start");
      ipcMain.removeHandler("space:command");
      ipcMain.removeHandler("workspace:get-snapshot");
      ipcMain.removeHandler("workspace:open-project");
      ipcMain.removeHandler("session-transcript:select");
      ipcMain.removeHandler("session-transcript:detach");
      ipcMain.removeHandler("dev-server:refresh");
      ipcMain.removeHandler("dev-server:open");
      ipcMain.removeHandler("performance:renderer-sample");
      ipcMain.removeHandler("clipboard:write-text");
    }),
  );

  yield* Effect.forkScoped(catalog.start.pipe(
    Effect.catch((error) => window.sendWorkspace({ kind: "error", source: "workspace_catalog", message: error.message })),
  ));

  let quitAllowed = false;
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      const activate = () => { if (BrowserWindow.getAllWindows().length === 0) void runEffect(window.create); };
      const allClosed = () => { if (process.platform !== "darwin") app.quit(); };
      const beforeQuit = (event: Electron.Event) => {
        if (quitAllowed) return;
        event.preventDefault();
        void runEffect(runtimes.close).finally(() => { quitAllowed = true; app.quit(); });
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
