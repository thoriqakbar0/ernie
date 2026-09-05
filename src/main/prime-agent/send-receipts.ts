import { createHash, randomUUID } from "node:crypto"
import type { SendRequest, SendReceipt } from "../../packages/prime-agent"

/** Owns bounded receipts. Entries never expire into an unsafe fresh dispatch. */
export class SendReceipts {
  readonly epoch = randomUUID()
  private readonly entries = new Map<string, { fingerprint: string; result: Promise<SendReceipt> }>()

  /** Replays an existing result; preparation failure guarantees no message dispatch. */
  async send(request: SendRequest, prepare: () => Promise<() => Promise<SendReceipt>>): Promise<SendReceipt> {
    if (request.epoch !== this.epoch) return { status: "unknown", message: "The send owner restarted. Check the conversation before sending this message again." }
    const fingerprint = createHash("sha256").update(JSON.stringify([request.sessionId, request.mode, request.content])).digest("hex")
    const existing = this.entries.get(request.commandId)
    if (existing) {
      if (existing.fingerprint !== fingerprint) return { status: "unknown", message: "This send identity belongs to a different message." }
      return existing.result
    }
    if (!request.content.trim()) return { status: "not-sent", message: "Write a message before sending." }
    if (this.entries.size >= 10_000) return { status: "not-sent", message: "The send receipt limit was reached. Restart Ernie before sending a new message." }
    // The microtask starts after reservation, so concurrent calls share one dispatch.
    const result = Promise.resolve().then(async (): Promise<SendReceipt> => {
      let dispatch: () => Promise<SendReceipt>
      try { dispatch = await prepare() }
      catch { return { status: "not-sent", message: "The connection was not ready. Your message was not sent; try again." } }
      try {
        return await dispatch()
      } catch {
        return { status: "unknown", message: "Prime Agent did not confirm this send. It may already have the message. Check the conversation before sending it again." }
      }
    })
    this.entries.set(request.commandId, { fingerprint, result })
    return result
  }
}
