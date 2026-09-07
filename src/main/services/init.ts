import { app } from "electron"
import { BrowserService } from "./browser"
import { Service } from "@zenbujs/core/runtime"
import { BaseWindowService, HttpService, WindowService } from "@zenbujs/core/services"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"
import { publishRuntimeDescriptor, readRendererMode, registerDesktopSmokeConnectionProbe } from "../dev-runtime.ts"

export class InitService extends Service.create({
  key: "init",
  deps: {
    browser: BrowserService,
    baseWindow: BaseWindowService,
    http: HttpService,
    window: WindowService,
  },
}) {
  async evaluate() {
    this.setup("sidebar-view", () =>
      this.inject({
        name: SIDEBAR_VIEW_TYPE,
        modulePath: "./src/renderer/components/sidebar.tsx",
        exportName: "Sidebar",
        meta: { kind: "sidebar", label: "Sidebar" },
      }),
    )

    this.setup("desktop-smoke-connection", () => registerDesktopSmokeConnectionProbe(this.ctx.http))

    if (readRendererMode() === "server") {
      const cleanup = await publishRuntimeDescriptor(this.ctx.http)
      this.setup("browser-runtime-descriptor", () => cleanup)
      return
    }

    this.setup("reopen-browser-window", () => {
      const activate = () => {
        if (this.ctx.baseWindow.windows.size > 0) return
        void this.openMainWindow().catch(error => console.error("Could not reopen Ernie", error))
      }
      // Zenbu's later activation listener sees the window registered synchronously
      // by openWindow, so it does not create a second window with default preferences.
      app.prependListener("activate", activate)
      return () => { app.removeListener("activate", activate) }
    })
    await this.openMainWindow()
  }
  private openMainWindow() {
    return this.ctx.window.openWindow({ webContentsView: { webPreferences: { webviewTag: true } } })
  }
}
