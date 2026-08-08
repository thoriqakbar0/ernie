import { app, BrowserWindow, session, type IpcMainInvokeEvent } from "electron";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type { WorkspaceEvent } from "../shared/contract";
import type { SpaceAgentEvent } from "../shared/spaceRuntime";
import type { SessionTranscriptEvent } from "../shared/sessionTranscript";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function isConfiguredDevelopmentRendererUrl(url: string): boolean {
  const configured = process.env["ELECTRON_RENDERER_URL"];
  const expected = configured ? new URL(configured).href : pathToFileURL(join(__dirname, "../renderer/index.html")).href;
  try { return new URL(url).href === expected; }
  catch { return false; }
}

export class ErnieWindowError extends Schema.TaggedErrorClass<ErnieWindowError>()(
  "ErnieWindowError",
  { operation: Schema.String, message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}

export class ErnieWindow extends Context.Service<ErnieWindow, {
  readonly create: Effect.Effect<BrowserWindow, ErnieWindowError>;
  readonly sendWorkspace: (event: WorkspaceEvent) => Effect.Effect<void>;
  readonly sendSpace: (event: SpaceAgentEvent) => Effect.Effect<void>;
  readonly sendSessionTranscript: (event: SessionTranscriptEvent) => Effect.Effect<void>;
  readonly trustedSender: (event: IpcMainInvokeEvent) => Effect.Effect<boolean>;
}>()("@ernie/main/ErnieWindow") {}

export const make = Effect.gen(function* () {
  const current = yield* Ref.make<Option.Option<BrowserWindow>>(Option.none());
  const trustedDocumentUrl = yield* Ref.make<Option.Option<string>>(Option.none());
  const failure = (operation: string, message: string, cause?: unknown) => new ErnieWindowError({ operation, message, ...(cause === undefined ? {} : { cause }) });

  const trustedSender = Effect.fn("ErnieWindow.trustedSender")(function* (event: IpcMainInvokeEvent) {
    const active = yield* Ref.get(current);
    const expectedUrl = yield* Ref.get(trustedDocumentUrl);
    if (Option.isNone(active) || Option.isNone(expectedUrl) || event.sender.id !== active.value.webContents.id || event.senderFrame === null) return false;
    if (event.senderFrame !== active.value.webContents.mainFrame) return false;
    return new URL(event.senderFrame.url).href === expectedUrl.value;
  });

  const sendWorkspace = Effect.fn("ErnieWindow.sendWorkspace")(function* (event: WorkspaceEvent) {
    const active = yield* Ref.get(current);
    if (Option.isSome(active) && !active.value.isDestroyed()) active.value.webContents.send("workspace:event", event);
  });

  const sendSpace = Effect.fn("ErnieWindow.sendSpace")(function* (event: SpaceAgentEvent) {
    const active = yield* Ref.get(current);
    if (Option.isSome(active) && !active.value.isDestroyed()) active.value.webContents.send("space:event", event);
  });

  const sendSessionTranscript = Effect.fn("ErnieWindow.sendSessionTranscript")(function* (event: SessionTranscriptEvent) {
    const active = yield* Ref.get(current);
    if (Option.isSome(active) && !active.value.isDestroyed()) active.value.webContents.send("session-transcript:event", event);
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
      window.on("closed", () => {
        Effect.runFork(Ref.set(current, Option.none()));
        Effect.runFork(Ref.set(trustedDocumentUrl, Option.none()));
      });
    });
    const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
    const rendererFile = join(__dirname, "../renderer/index.html");
    const targetUrl = !app.isPackaged && rendererUrl ? new URL(rendererUrl).href : pathToFileURL(rendererFile).href;
    yield* Ref.set(trustedDocumentUrl, Option.some(targetUrl));
    yield* Effect.tryPromise({
      try: () => !app.isPackaged && rendererUrl ? window.loadURL(targetUrl) : window.loadFile(rendererFile),
      catch: (cause) => failure("load", "The Ernie renderer could not be loaded", cause),
    });
    return window;
  }).pipe(Effect.withSpan("ErnieWindow.create"));

  return ErnieWindow.of({ create, sendWorkspace, sendSpace, sendSessionTranscript, trustedSender });
});

export const layer = Layer.effect(ErnieWindow, make);

export const hardenElectron = Effect.sync(() => {
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const allowClipboardWrite = !app.isPackaged
      && permission === "clipboard-sanitized-write"
      && details.isMainFrame
      && isConfiguredDevelopmentRendererUrl(details.requestingUrl)
      && isConfiguredDevelopmentRendererUrl(contents.getURL());
    callback(allowClipboardWrite);
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
    const requestingUrl = details.requestingUrl ?? requestingOrigin;
    return !app.isPackaged
      && contents !== null
      && permission === "clipboard-sanitized-write"
      && details.isMainFrame
      && isConfiguredDevelopmentRendererUrl(requestingUrl)
      && isConfiguredDevelopmentRendererUrl(contents.getURL());
  });
  session.defaultSession.on("will-download", (event) => event.preventDefault());
  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, url) => { if (url !== contents.getURL()) event.preventDefault(); });
  });
});
