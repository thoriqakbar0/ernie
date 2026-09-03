import { Service } from "@zenbujs/core/runtime"
import { RpcService } from "@zenbujs/core/services"

export class SessionSelectionService extends Service.create({
  key: "sessionSelection",
  deps: { rpc: RpcService },
}) {
  private selectedSessionId: string | undefined

  get() {
    return this.selectedSessionId
  }

  select(input: { sessionId: string }) {
    const sessionId = input.sessionId.trim()
    if (!sessionId) throw new Error("A Prime Agent session ID is required")
    if (sessionId === this.selectedSessionId) return

    this.selectedSessionId = sessionId
    this.ctx.rpc.emit.app.primeSessionSelected({ sessionId })
  }

  clear() {
    if (this.selectedSessionId === undefined) return
    this.selectedSessionId = undefined
    this.ctx.rpc.emit.app.primeSessionSelected({})
  }
}
