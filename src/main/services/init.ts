import { Service } from "@zenbujs/core/runtime"
import { BaseWindowService, HttpService, WindowService } from "@zenbujs/core/services"
import { app } from "electron"
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
  }

  private openMainWindow() {
    return this.ctx.window.openWindow({ webContentsView: { webPreferences: { webviewTag: true } } })
  }
}
