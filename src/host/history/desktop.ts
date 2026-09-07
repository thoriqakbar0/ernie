import { app, BrowserWindow, ipcMain, Menu, dialog } from "electron"
import { spawn, type ChildProcess } from "node:child_process"
import { access } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { Effect } from "effect"
import { HistoryController } from "./controller"
import { serveHistory } from "./transport"
import { failure } from "./source-store"

type Bootstrap = Readonly<{
  source: string; version: string; home?: string; officialSource?: string;
  prepareSource?: () => Promise<void>;
  install: (directory: string) => Promise<void>;
}>
/** Immutable parent owns recovery even when editable Ernie crashes during startup. */
export async function startHistoryDesktop(bootstrap: Bootstrap) {
  await app.whenReady()
  if (!app.requestSingleInstanceLock({ host: "history" })) { app.quit(); return }
  let child: ChildProcess | undefined
  let window: BrowserWindow | undefined
  let closing = false
  let controller: HistoryController | undefined
  let closeServer: (() => Promise<void>) | undefined
  let startupStatus = "Starting Ernie…"
  let initializing: Promise<void> | undefined
  const home = bootstrap.home ?? join(homedir(), ".ernie", "app-history")
  const openWindow = () => {
    if (window && !window.isDestroyed()) { window.show(); window.focus(); return }
    window = new BrowserWindow({ width: 800, height: 650, title: "Ernie app history", webPreferences: {
      preload: join(app.getAppPath(), "history-preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true,
    } })
    void window.loadFile(join(app.getAppPath(), "history.html")).catch(() => { console.error("Bundled recovery assets could not load.") })
  }
  const openGeneration = async (directory: string) => {
    startupStatus = "Opening Ernie…"
    const previous = child
    child = undefined
    if (previous && previous.exitCode === null && previous.signalCode === null) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => previous.kill("SIGKILL"), 5000)
        previous.once("exit", () => { clearTimeout(timer); resolve() })
        previous.kill("SIGTERM")
      })
    }
    await new Promise<void>((resolve, reject) => {
      const processChild = spawn(process.execPath, [app.getAppPath(), `--ernie-history-child=${directory}`], {
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: { ...process.env, ERNIE_HISTORY_HOME: home, ERNIE_HISTORY_CLI: join(app.getAppPath(), "ernie-history"), ERNIE_MANAGED_SOURCE: directory, ERNIE_INITIAL_SOURCE: bootstrap.source,
          ERNIE_ZENBU_DB: join(bootstrap.source, ".zenbu", "db") },
      })
      child = processChild
      const failed = () => { startupStatus = "Ernie could not start. Choose a startup-checked checkpoint, or try opening again."; openWindow() }
      const timeout = setTimeout(() => { failed(); processChild.kill("SIGTERM"); reject(new Error("Readiness timed out")) }, 60000)
      processChild.once("error", error => { clearTimeout(timeout); failed(); reject(error) })
      processChild.on("message", message => {
        if (message && typeof message === "object" && "type" in message && message.type === "ernie-quit" && child === processChild) { app.quit(); return }
        if (message && typeof message === "object" && "type" in message && message.type === "ernie-ready") {
          clearTimeout(timeout); startupStatus = "Ernie completed its startup readiness check."; resolve()
        }
      })
      processChild.once("exit", () => {
        clearTimeout(timeout)
        if (!closing && child === processChild) { child = undefined; failed(); reject(new Error("Ernie stopped")) }
      })
    })
  }
  const initialize = () => {
    if (initializing) return initializing
    initializing = (async () => {
      if (!controller) {
        await bootstrap.prepareSource?.()
        await Promise.all(["history.html", "history-ui.js", "history-preload.cjs"].map(file => access(join(app.getAppPath(), file))))
        controller = await HistoryController.open({ home, managed: true, recoveryAvailable: true, initialSource: bootstrap.source, hostVersion: bootstrap.version, dataGeneration: 1,
          activation: { install: bootstrap.install, requestApproval: openWindow, open: openGeneration } })
        closeServer = await serveHistory(controller, home)
        controller.startWatching()
      }
      await bootstrap.install(controller.activeGeneration)
      await controller.openCurrent()
      await controller.markKnownWorking()
    })().catch(() => { startupStatus = "Ernie could not start. Recovery remains available."; openWindow() }).finally(() => { initializing = undefined })
    return initializing
  }
  const unavailable = () => ({ ok: false as const, error: { code: "history_unavailable", message: startupStatus, nextAction: "Try opening again or inspect the recovery diagnostics." } })
  ipcMain.handle("ernie-history-host-status", event => window && event.sender === window.webContents ? startupStatus : "Unavailable")
  ipcMain.handle("ernie-history-request", async (event, request: unknown) => {
    if (!window || event.sender !== window.webContents || !controller) return unavailable()
    return Effect.runPromise(controller.request(request).pipe(Effect.match({ onSuccess: value => ({ ok: true, value }), onFailure: error => ({ ok: false, error }) })))
  })
  ipcMain.handle("ernie-history-reopen", async event => {
    if (!window || event.sender !== window.webContents) return unavailable()
    await initialize()
    return child ? { ok: true } : unavailable()
  })
  ipcMain.handle("ernie-history-finish", async (event, operationId: unknown) => {
    if (!window || event.sender !== window.webContents || !controller || typeof operationId !== "string") return unavailable()
    const response = await dialog.showMessageBox(window, { type: "question", message: "End this customization interval?", detail: "Stop the editing Agent first. This ends history tracking for the interval; it does not stop an external Agent process.", buttons: ["Cancel", "Editing has stopped"], defaultId: 0, cancelId: 0 })
    if (response.response !== 1) return { ok: false, error: { message: "Operation remains active." } }
    return Effect.runPromise(controller.request({ method: "customization.finish", operationId, summary: "Customization interval ended by user" }).pipe(Effect.match({ onSuccess: value => ({ ok: true, value }), onFailure: error => ({ ok: false, error }) })))
  })
  ipcMain.handle("ernie-history-approve", async (event, proposalId: unknown) => {
    if (!window || event.sender !== window.webContents || !controller || typeof proposalId !== "string") return unavailable()
    try {
      const review = controller.review(proposalId)
      const response = await dialog.showMessageBox(window, { type: "warning", title: "Restore this checkpoint?",
        message: "Restore this checkpoint? App changes made afterward will be replaced. Your conversations and Agents will stay.",
        detail: `Checkpoint ${review.checkpointId}\nSaved ${review.createdAt}\n${review.fileCount} application files in this checkpoint.\nStop external agents editing Ernie before restoring. The current app will be saved first.`,
        buttons: ["Cancel", "Restore checkpoint"], defaultId: 0, cancelId: 0 })
      if (response.response !== 1) return { ok: false, error: { message: "Restore cancelled." } }
      return { ok: true, value: await controller.approve(proposalId) }
    } catch (error) { return { ok: false, error: failure(error) } }
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: "Ernie", submenu: [
    { label: "App history…", click: openWindow }, { label: "Recover Ernie…", click: openWindow },
    { label: "Review official update…", enabled: Boolean(bootstrap.officialSource), click: () => {
      if (controller && bootstrap.officialSource) void controller.prepareOfficialUpdate(bootstrap.officialSource).then(openWindow).catch(error => { startupStatus = failure(error).message; openWindow() })
    } }, { type: "separator" }, { role: "quit" },
  ] }]))
  app.on("window-all-closed", () => {})
  app.on("second-instance", openWindow)
  app.on("activate", openWindow)
  app.on("before-quit", () => {
    closing = true; controller?.stopWatching(); child?.kill("SIGTERM")
    if (closeServer) void closeServer().catch(() => { console.warn("History socket cleanup was interrupted.") })
  })
  await initialize()
}
