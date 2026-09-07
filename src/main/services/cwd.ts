import { Service } from "@zenbujs/core/runtime"

export class CwdService extends Service.create({ key: "cwd" }) {
  /** Returns the process working directory exposed through Zenbu RPC. */
  get() {
    return process.cwd()
  }
}
