import { app, BrowserWindow, session, shell, type IpcMainInvokeEvent } from "electron";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type { AgentEvent } from "../shared/contract";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class ErnieWindowError extends Schema.TaggedErrorClass<ErnieWindowError>()(
  "ErnieWindowError",
  { operation: Schema.String, message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}

export class ErnieWindow extends Context.Service<ErnieWindow, {
  readonly create: Effect.Effect<BrowserWindow, ErnieWindowError>;
  readonly send: (event: AgentEvent) => Effect.Effect<void>;
  readonly trustedSender: (event: IpcMainInvokeEvent) => Effect.Effect<boolean>;
}>()("@ernie/main/ErnieWindow") {}

export const make = Effect.gen(function* () {
  const current = yield* Ref.make<Option.Option<BrowserWindow>>(Option.none());
  const failure = (operation: string, message: string, cause?: unknown) => new ErnieWindowError({ operation, message, ...(cause === undefined ? {} : { cause }) });

  const trustedSender = Effect.fn("ErnieWindow.trustedSender")(function* (event: IpcMainInvokeEvent) {
    const active = yield* Ref.get(current);
    if (Option.isNone(active) || event.sender.id !== active.value.webContents.id || event.senderFrame === null) return false;
    const url = event.senderFrame.url;
    return url.startsWith("file://") || url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:");
  });

  const send = Effect.fn("ErnieWindow.send")(function* (event: AgentEvent) {
    const active = yield* Ref.get(current);
    if (Option.isSome(active) && !active.value.isDestroyed()) active.value.webContents.send("agent:event", event);
  });

  const create = Effect.gen(function* () {
    const window = yield* Effect.try({
      try: () => new BrowserWindow({
        width: 1_040, height: 720, minWidth: 820, minHeight: 520, show: false,
        backgroundColor: "#0b0b0c", title: "Ernie Dev", titleBarStyle: "hiddenInset",
        trafficLightPosition: { x: 16, y: 17 },
        webPreferences: {
          preload: join(__dirname, "../preload/index.cjs"), contextIsolation: true, sandbox: true,
          nodeIntegration: false, webviewTag: false, webSecurity: true, allowRunningInsecureContent: false,
          devTools: !app.isPackaged,
        },
      }),
      catch: (cause) => failure("create", "The Ernie window could not be created", cause),
    });
    yield* Ref.set(current, Option.some(window));
    yield* Effect.sync(() => {
      window.once("ready-to-show", () => window.show());
      window.on("closed", () => { Effect.runFork(Ref.set(current, Option.none())); });
    });
    const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
    yield* Effect.tryPromise({
      try: () => !app.isPackaged && rendererUrl ? window.loadURL(rendererUrl) : window.loadFile(join(__dirname, "../renderer/index.html")),
      catch: (cause) => failure("load", "The Ernie renderer could not be loaded", cause),
    });
    return window;
  }).pipe(Effect.withSpan("ErnieWindow.create"));

  return ErnieWindow.of({ create, send, trustedSender });
});

export const layer = Layer.effect(ErnieWindow, make);

export const hardenElectron = Effect.sync(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.on("will-download", (event) => event.preventDefault());
  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://agentation.dev/") || url.startsWith("https://github.com/benjitaylor/agentation")) void shell.openExternal(url);
      return { action: "deny" };
    });
    contents.on("will-navigate", (event, url) => { if (url !== contents.getURL()) event.preventDefault(); });
  });
});
