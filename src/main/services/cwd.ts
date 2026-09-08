import { homedir } from "node:os"
import { Service } from "@zenbujs/core/runtime"

export class CwdService extends Service.create({ key: "cwd" }) {
  /** Returns the neutral starting folder for new Agent drafts. */
  get() {
    return homedir()
  }
}
