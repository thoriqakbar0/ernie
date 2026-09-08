import { Service } from "@zenbujs/core/runtime"
import { BaseWindowService, HttpService, WindowService } from "@zenbujs/core/services"
import { app, Menu } from "electron"
import type { Event, Input, MenuItem, WebContents } from "electron"
import { BrowserService } from "./browser"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"
import {
  publishRuntimeDescriptor,
  readRendererMode,
  registerDesktopSmokeConnectionProbe,
} from "../dev-runtime.ts"

export class InitService extends Service.create({
  deps: {
    baseWindow: BaseWindowService,
    browser: BrowserService,
    http: HttpService,
    window: WindowService,
  },
  key: "init",
}) {
  async evaluate() {
    // @lat: [[development#Development workflow#Desktop close shortcut]]
    this.setup("preserve-window-on-command-w", () => {
      const contents = new Set<WebContents>()
      const preventCloseShortcut = (event: Event, input: Input) => {
        if (
          input.meta &&
          !input.control &&
          !input.alt &&
          !input.shift &&
          input.key.toLowerCase() === "w"
        ) {
          event.preventDefault()
        }
      }
      const register = (_event: Event, webContents: WebContents) => {
        contents.add(webContents)
        webContents.on("before-input-event", preventCloseShortcut)
        const refreshPage = (event: Event, input: Input) => {
          const refresh = ((input.meta || input.control) && input.key.toLowerCase() === "r") || input.key === "F5"
          if (!refresh || input.alt || input.type !== "keyDown") return
          event.preventDefault()
          if (webContents.getType() === "webview") {
            if (input.shift) webContents.reloadIgnoringCache()
            else webContents.reload()
            return
          }
          void webContents.executeJavaScript(
            `window.dispatchEvent(new CustomEvent("ernie:refresh", { detail: { ignoreCache: ${input.shift} } }))`,
          ).catch((error: unknown) => console.error("Could not refresh page", error))
        }
        webContents.on("before-input-event", refreshPage)
        webContents.once("destroyed", () => webContents.removeListener("before-input-event", refreshPage))

        webContents.once("destroyed", () => contents.delete(webContents))
      }
      app.on("web-contents-created", register)
      return () => {
        app.removeListener("web-contents-created", register)
        for (const webContents of contents) {
          webContents.removeListener("before-input-event", preventCloseShortcut)
        }
      }
    })

    this.setup("sidebar-view", () =>
      this.inject({
        exportName: "Sidebar",
        meta: { kind: "sidebar", label: "Sidebar" },
        modulePath: "./src/renderer/components/sidebar.tsx",
        name: SIDEBAR_VIEW_TYPE,
      }),
    )

    this.setup("desktop-smoke-connection", () => registerDesktopSmokeConnectionProbe(this.ctx.http))

    if (readRendererMode() === "server") {
      const cleanup = await publishRuntimeDescriptor(this.ctx.http)
      this.setup("browser-runtime-descriptor", () => cleanup)
      return
    }

    this.setup("reopen-browser-window", () => {
      const activate = async () => {
        if (this.ctx.baseWindow.windows.size > 0) {
          return
        }
        try {
          await this.openMainWindow()
        } catch (error: unknown) {
          console.error("Could not reopen Ernie", error)
        }
      }
      // Register the window synchronously before Zenbu's default activation listener runs.
      app.prependListener("activate", activate)
      return () => {
        app.removeListener("activate", activate)
      }
    })
    await this.openMainWindow()
    this.setup("disable-native-close-shortcut", () => {
      const menu = Menu.getApplicationMenu()
      const items = menu ? [...menu.items] : []
      const disabled: MenuItem[] = []
      for (const item of items) {
        if (item.submenu) {
          items.push(...item.submenu.items)
        }
        if (item.role === "close" && item.enabled) {
          item.enabled = false
          disabled.push(item)
        }
      }
      return () => {
        for (const item of disabled) {
          item.enabled = true
        }
      }
    })
  }

  private openMainWindow() {
    return this.ctx.window.openWindow({ webContentsView: { webPreferences: { webviewTag: true } } })
  }
}
