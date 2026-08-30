import { Service } from "@zenbujs/core/runtime"
import {
  RendererHostService,
  ViewRegistryService,
  WindowService,
} from "@zenbujs/core/services"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"

export class InitService extends Service.create({
  key: "init",
  deps: {
    rendererHost: RendererHostService,
    viewRegistry: ViewRegistryService,
    window: WindowService,
  },
}) {
  async evaluate() {
    this.setup("sidebar-view", () => {
      this.ctx.viewRegistry.registerAlias({
        type: SIDEBAR_VIEW_TYPE,
        reloaderId: "app",
        pathPrefix: "",
        meta: { kind: "sidebar", label: "Sidebar" },
      })

      return () => this.ctx.viewRegistry.unregister(SIDEBAR_VIEW_TYPE)
    })

    await this.ctx.window.openView({ type: "entrypoint" })
  }
}
