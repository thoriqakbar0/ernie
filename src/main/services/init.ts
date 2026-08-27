import { Service } from "@zenbujs/core/runtime"
import { WindowService } from "@zenbujs/core/services"

export class InitService extends Service.create({
  key: "init",
  deps: { window: WindowService },
}) {
  /** Opens the renderer after Zenbu activates the host plugin. */
  async evaluate() {
    await this.ctx.window.openView({ type: "entrypoint" })
  }
}
