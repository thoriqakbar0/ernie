import { app, BrowserWindow, ipcMain, Menu, dialog } from "electron"
import { spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { access } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { homedir } from "node:os"
import { Effect } from "effect"
import { HistoryController } from "./controller"
import { serveHistory } from "./transport"
import { failure } from "./source-store"

type Bootstrap = Readonly<{
  source: string
  version: string
  home?: string
  officialSource?: string
  prepareSource?: () => Promise<void>
  install: (directory: string) => Promise<void>
}>
/** Immutable parent owns recovery even when editable Ernie crashes during startup. */
export const startHistoryDesktop = async (bootstrap: Bootstrap) => {
  await app.whenReady()
  if (!app.requestSingleInstanceLock({ host: "history" })) {
    app.quit()
    return
  }
  let child: ChildProcess | undefined
  let window: BrowserWindow | undefined
  let closing = false
  let controller: HistoryController | undefined
  let closeServer: (() => Promise<void>) | undefined
  let startupStatus = "Starting Ernie…"
  let initializing: Promise<void> | undefined
  const home = bootstrap.home ?? path.join(homedir(), ".ernie", "app-history")
  const openWindow = () => {
    if (window && !window.isDestroyed()) {
      window.show()
      window.focus()
      return
    }
    window = new BrowserWindow({
      height: 650,
      title: "Ernie app history",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(app.getAppPath(), "history-preload.cjs"),
        sandbox: true,
      },
      width: 800,
    })
    const recoveryWindow = window
    void (async () => {
      try {
        await recoveryWindow.loadFile(path.join(app.getAppPath(), "history.html"))
      } catch {
        console.error("Bundled recovery assets could not load.")
      }
    })()
  }
  const openGeneration = async (directory: string) => {
    startupStatus = "Opening Ernie…"
    const previous = child
    child = undefined
    if (previous && previous.exitCode === null && previous.signalCode === null) {
      await promisify((complete: (error: Error | null) => void) => {
        const timer = setTimeout(() => previous.kill("SIGKILL"), 5000)
        previous.once("exit", () => {
          clearTimeout(timer)
          complete(null)
        })
        previous.kill("SIGTERM")
      })()
    }
    await promisify((complete: (error: Error | null) => void) => {
      const processChild = spawn(
        process.execPath,
        [app.getAppPath(), `--ernie-history-child=${directory}`],
        {
          env: {
            ...process.env,
            ERNIE_HISTORY_CLI: path.join(app.getAppPath(), "ernie-history"),
            ERNIE_HISTORY_HOME: home,
            ERNIE_INITIAL_SOURCE: bootstrap.source,
            ERNIE_MANAGED_SOURCE: directory,
            ERNIE_ZENBU_DB: path.join(bootstrap.source, ".zenbu", "db"),
          },
          stdio: ["ignore", "ignore", "ignore", "ipc"],
        },
      )
      child = processChild
      const failed = () => {
        startupStatus =
          "Ernie could not start. Choose a startup-checked checkpoint, or try opening again."
        openWindow()
      }
      const timeout = setTimeout(() => {
        failed()
        processChild.kill("SIGTERM")
        complete(new Error("Readiness timed out"))
      }, 60_000)
      processChild.once("error", (error) => {
        clearTimeout(timeout)
        failed()
        complete(error)
      })
      processChild.on("message", (message) => {
        if (
          message &&
          typeof message === "object" &&
          "type" in message &&
          message.type === "ernie-quit" &&
          child === processChild
        ) {
          app.quit()
          return
        }
        if (
          message &&
          typeof message === "object" &&
          "type" in message &&
          message.type === "ernie-ready"
        ) {
          clearTimeout(timeout)
          startupStatus = "Ernie completed its startup readiness check."
          complete(null)
        }
      })
      processChild.once("exit", () => {
        clearTimeout(timeout)
        if (!closing && child === processChild) {
          child = undefined
          failed()
          complete(new Error("Ernie stopped"))
        }
      })
    })()
  }
  const initialize = () => {
    if (initializing) {
      return initializing
    }
    initializing = (async () => {
      try {
        if (!controller) {
          await bootstrap.prepareSource?.()
          await Promise.all(
            ["history.html", "history-ui.js", "history-preload.cjs"].map((file) =>
              access(path.join(app.getAppPath(), file)),
            ),
          )
          controller = await HistoryController.open({
            activation: {
              install: bootstrap.install,
              open: openGeneration,
              requestApproval: openWindow,
            },
            dataGeneration: 1,
            home,
            hostVersion: bootstrap.version,
            initialSource: bootstrap.source,
            managed: true,
            recoveryAvailable: true,
          })
          closeServer = await serveHistory(controller, home)
          controller.startWatching()
        }
        await bootstrap.install(controller.activeGeneration)
        await controller.openCurrent()
        await controller.markKnownWorking()
      } catch {
        startupStatus = "Ernie could not start. Recovery remains available."
        openWindow()
      } finally {
        initializing = undefined
      }
    })()
    return initializing
  }
  const unavailable = () => ({
    error: {
      code: "history_unavailable",
      message: startupStatus,
      nextAction: "Try opening again or inspect the recovery diagnostics.",
    },
    ok: false as const,
  })
  ipcMain.handle("ernie-history-host-status", (event) =>
    window && event.sender === window.webContents ? startupStatus : "Unavailable",
  )
  ipcMain.handle("ernie-history-request", (event, request: unknown) => {
    if (!window || event.sender !== window.webContents || !controller) {
      return unavailable()
    }
    return Effect.runPromise(
      controller.request(request).pipe(
        Effect.match({
          onFailure: (error) => ({ error, ok: false }),
          onSuccess: (value) => ({ ok: true, value }),
        }),
      ),
    )
  })
  ipcMain.handle("ernie-history-reopen", async (event) => {
    if (!window || event.sender !== window.webContents) {
      return unavailable()
    }
    await initialize()
    return child ? { ok: true } : unavailable()
  })
  ipcMain.handle("ernie-history-finish", async (event, operationId: unknown) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      !controller ||
      typeof operationId !== "string"
    ) {
      return unavailable()
    }
    const response = await dialog.showMessageBox(window, {
      buttons: ["Cancel", "Editing has stopped"],
      cancelId: 0,
      defaultId: 0,
      detail:
        "Stop the editing Agent first. This ends history tracking for the interval; it does not stop an external Agent process.",
      message: "End this customization interval?",
      type: "question",
    })
    if (response.response !== 1) {
      return { error: { message: "Operation remains active." }, ok: false }
    }
    return Effect.runPromise(
      controller
        .request({
          method: "customization.finish",
          operationId,
          summary: "Customization interval ended by user",
        })
        .pipe(
          Effect.match({
            onFailure: (error) => ({ error, ok: false }),
            onSuccess: (value) => ({ ok: true, value }),
          }),
        ),
    )
  })
  ipcMain.handle("ernie-history-approve", async (event, proposalId: unknown) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      !controller ||
      typeof proposalId !== "string"
    ) {
      return unavailable()
    }
    try {
      const review = controller.review(proposalId)
      const response = await dialog.showMessageBox(window, {
        buttons: ["Cancel", "Restore checkpoint"],
        cancelId: 0,
        defaultId: 0,
        detail: `Checkpoint ${review.checkpointId}\nSaved ${review.createdAt}\n${review.fileCount} application files in this checkpoint.\nStop external agents editing Ernie before restoring. The current app will be saved first.`,
        message:
          "Restore this checkpoint? App changes made afterward will be replaced. Your conversations and Agents will stay.",
        title: "Restore this checkpoint?",
        type: "warning",
      })
      if (response.response !== 1) {
        return { error: { message: "Restore cancelled." }, ok: false }
      }
      return { ok: true, value: await controller.approve(proposalId) }
    } catch (error) {
      return { error: failure(error), ok: false }
    }
  })
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Ernie",
        submenu: [
          { click: openWindow, label: "App history…" },
          { click: openWindow, label: "Recover Ernie…" },
          {
            click: async () => {
              if (controller && bootstrap.officialSource) {
                try {
                  await controller.prepareOfficialUpdate(bootstrap.officialSource)
                  openWindow()
                } catch (error) {
                  startupStatus = failure(error).message
                  openWindow()
                }
              }
            },
            enabled: Boolean(bootstrap.officialSource),
            label: "Review official update…",
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
    ]),
  )
  app.on("window-all-closed", () => {
    // Keep the recovery host running when all windows close.
  })
  const activateApp = () => {
    if (child?.connected) {
      // Node IPC reports asynchronous send failures through its callback.
      // oxlint-disable-next-line promise/prefer-await-to-callbacks
      child.send({ type: "ernie-activate" }, (error) => {
        if (error) {
          openWindow()
        }
      })
    } else {
      openWindow()
    }
  }
  app.on("second-instance", activateApp)
  app.on("activate", activateApp)
  app.on("before-quit", async () => {
    closing = true
    controller?.stopWatching()
    child?.kill("SIGTERM")
    if (closeServer) {
      try {
        await closeServer()
      } catch {
        console.warn("History socket cleanup was interrupted.")
      }
    }
  })
  await initialize()
}
