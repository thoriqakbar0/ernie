import path from "node:path"
import { getPlugin } from "@zenbujs/core/config"
import { Service } from "@zenbujs/core/runtime"
import { app, nativeImage } from "electron"

/** Applies the development identity to macOS's Dock without changing packaged branding. */
export class BrandingService extends Service.create({ key: "branding" }) {
  /** Uses the launcher's development marker; public builds retain their packaged icon. */
  async evaluate() {
    if (!process.env.ERNIE_DEV_GENERATION || app.isPackaged || process.platform !== "darwin") {
      return
    }
    const plugin = getPlugin("app")
    if (!plugin) {
      throw new Error("Ernie branding requires the app plugin")
    }
    await app.whenReady()
    const icon = nativeImage.createFromPath(path.join(plugin.dir, "src/browser/icon.png"))
    if (icon.isEmpty()) {
      throw new Error("Missing development icon; run nub run brand:sync")
    }
    app.dock?.setIcon(icon)
  }
}
