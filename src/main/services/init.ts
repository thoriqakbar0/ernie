import { Service } from "@zenbujs/core/runtime"
import { WindowService } from "@zenbujs/core/services"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"

export class InitService extends Service.create({
  key: "init",
  deps: {
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

    await this.ctx.window.openWindow({})
  }
}
