import { parseBrowserAddress } from "../../packages/browser"
import { Service } from "@zenbujs/core/runtime"
import { app, session, webContents, type WebContents } from "electron"

/** Isolates embedded pages from Ernie's privileged renderer and login storage. */
export class BrowserService extends Service.create({ key: "browser" }) {
  /** Applies the guest policy before Electron attaches a webview. */
  async evaluate() {
    await app.whenReady()
    this.setup("browser-guests", () => {
      const cleanups = new Set<() => void>()
      const partition = session.fromPartition("persist:ernie-browser")
      const guests = new Set<WebContents>()
      const protectGuest = (guest: WebContents) => {
        if (guests.has(guest) || guest.session !== partition) return
        guests.add(guest)
        guest.setWindowOpenHandler(() => ({ action: "deny" }))
        partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
        partition.setPermissionCheckHandler(() => false)
        const navigate = (event: Electron.Event, url: string) => {
          if (!parseBrowserAddress(url, false).ok) event.preventDefault()
        }
        guest.on("will-navigate", navigate)
        guest.on("will-redirect", navigate)
        const destroyed = () => { guests.delete(guest); cleanups.delete(cleanup) }
        const cleanup = () => {
          guests.delete(guest)
          if (guest.isDestroyed()) return
          guest.off("will-navigate", navigate)
          guest.off("will-redirect", navigate)
          guest.off("destroyed", destroyed)
        }
        guest.once("destroyed", destroyed)
        cleanups.add(cleanup)
      }
      const protect = (contents: WebContents) => {
        const attach = (event: Electron.Event, preferences: Electron.WebPreferences, params: Record<string, string>) => {
          if (params.partition !== "persist:ernie-browser" || !parseBrowserAddress(params.src, false).ok) {
            event.preventDefault()
            return
          }
          delete preferences.preload
          preferences.nodeIntegration = false
          preferences.nodeIntegrationInSubFrames = false
          preferences.nodeIntegrationInWorker = false
          preferences.contextIsolation = true
          preferences.sandbox = true
          preferences.webSecurity = true
          preferences.webviewTag = false
        }
        const attached = (_event: Electron.Event, guest: WebContents) => {
          protectGuest(guest)
        }
        contents.on("will-attach-webview", attach)
        contents.on("did-attach-webview", attached)
        const destroyed = () => cleanups.delete(cleanup)
        const cleanup = () => {
          if (contents.isDestroyed()) return
          contents.off("will-attach-webview", attach)
          contents.off("did-attach-webview", attached)
          contents.off("destroyed", destroyed)
        }
        cleanups.add(cleanup)
        contents.once("destroyed", destroyed)
      }
      const created = (_event: Electron.Event, contents: WebContents) => protect(contents)
      app.on("web-contents-created", created)
      for (const contents of webContents.getAllWebContents()) {
        protect(contents)
        if (contents.getType() === "webview") protectGuest(contents)
      }
      return () => { app.off("web-contents-created", created); for (const cleanup of cleanups) cleanup() }
    })
  }
}
