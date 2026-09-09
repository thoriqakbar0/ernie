import { mkdir } from "node:fs/promises"
import path from "node:path"
import { app } from "electron"
import { Service } from "@zenbujs/core/runtime"

export class CwdService extends Service.create({ key: "cwd" }) {
  /** New chats without a selected folder use an app-owned workspace. */
  async get() {
    const folder = path.join(app.getPath("userData"), "workspace")
    await mkdir(folder, { recursive: true })
    return folder
  }
}
