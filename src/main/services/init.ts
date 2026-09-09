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

const dispatchPageRefresh = async (webContents: WebContents, ignoreCache: boolean) => {
  try {
    await webContents.executeJavaScript(
      `window.dispatchEvent(new CustomEvent("ernie:refresh", { detail: { ignoreCache: ${ignoreCache} } }))`,
    )
  } catch (error: unknown) {
    console.error("Could not refresh page", error)
  }
}

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
      const contents = new Map<WebContents, () => void>()
      const register = (_event: Event, webContents: WebContents) => {
        webContents.on("before-input-event", preventCloseShortcut)
        const refreshPage = (event: Event, input: Input) => {
          const refresh =
            ((input.meta || input.control) && input.key.toLowerCase() === "r") || input.key === "F5"
          if (!refresh || input.alt || input.type !== "keyDown") {
            return
          }
          event.preventDefault()
          if (webContents.getType() === "webview") {
            if (input.shift) {
              webContents.reloadIgnoringCache()
            } else {
              webContents.reload()
            }
            return
          }
          void dispatchPageRefresh(webContents, input.shift)
        }
        webContents.on("before-input-event", refreshPage)
        const cleanup = () => {
          webContents.removeListener("before-input-event", preventCloseShortcut)
          webContents.removeListener("before-input-event", refreshPage)
          webContents.removeListener("destroyed", cleanup)
          contents.delete(webContents)
        }
        contents.set(webContents, cleanup)
        webContents.once("destroyed", cleanup)
      }
      app.on("web-contents-created", register)
      return () => {
        app.removeListener("web-contents-created", register)
        for (const cleanup of contents.values()) {
          cleanup()
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
