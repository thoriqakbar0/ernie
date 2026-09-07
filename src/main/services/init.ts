import { Service } from "@zenbujs/core/runtime"
import { HttpService, WindowService } from "@zenbujs/core/services"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"
import {
  publishRuntimeDescriptor,
  readRendererMode,
  registerDesktopSmokeConnectionProbe,
} from "../dev-runtime.ts"

export class InitService extends Service.create({
  deps: {
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

    await this.ctx.window.openWindow({})
  }
}
