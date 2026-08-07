import { app, BrowserWindow, ipcMain } from "electron";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type { AgentCommand, CommandResult } from "../shared/contract";
import { AgentCommandSchema } from "./IpcProtocol";
import { ErnieWindow, hardenElectron } from "./ErnieWindow";
import { PrimeAgentRpc } from "./PrimeAgentRpc";

export const program = Effect.scoped(Effect.gen(function* () {
  const rpc = yield* PrimeAgentRpc;
  const window = yield* ErnieWindow;
  yield* Effect.promise(() => app.whenReady());
  yield* hardenElectron;
  yield* window.create;
  yield* Effect.forkScoped(Stream.runForEach(rpc.events, window.send));

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
      ipcMain.handle("agent:get-commands", (event) => runEffect(Effect.gen(function* () {
        if (!(yield* window.trustedSender(event))) return yield* Effect.die(new Error("Untrusted IPC sender"));
        return yield* rpc.availableCommands;
      })));
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
      ipcMain.removeHandler("agent:get-commands");
      ipcMain.removeHandler("agent:command");
    }),
  );

  yield* Effect.forkScoped(rpc.start);

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
