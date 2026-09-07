import { createHash, randomUUID } from "node:crypto"
import { HistoryFailure } from "../../packages/app-history"
import type { SendRequest, SendReceipt } from "../../packages/prime-agent"

/** Owns bounded receipts. Entries never expire into an unsafe fresh dispatch. */
export class SendReceipts {
  readonly epoch = randomUUID()
  private readonly entries = new Map<
    string,
    { fingerprint: string; result: Promise<SendReceipt> }
  >()

  /** Replays an existing result; preparation failure guarantees no message dispatch. */
  send(
    request: SendRequest,
    prepare: () => Promise<() => Promise<SendReceipt>>,
  ): Promise<SendReceipt> {
    return this.resolve(request, prepare)
  }

  /** Checks delivery without dispatch; an absent identity rejects any late original request. */
  check(request: SendRequest): Promise<SendReceipt> {
    return this.resolve(request)
  }

  private async resolve(
    request: SendRequest,
    prepare?: () => Promise<() => Promise<SendReceipt>>,
  ): Promise<SendReceipt> {
    if (request.epoch !== this.epoch) {
      return {
        message:
          "The send owner restarted. Check the conversation before sending this message again.",
        status: "unknown",
      }
    }
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([request.sessionId, request.mode, request.content]))
      .digest("hex")
    const existing = this.entries.get(request.commandId)
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return { message: "This send identity belongs to a different message.", status: "unknown" }
      }
      return existing.result
    }
    if (!request.content.trim()) {
      return { message: "Write a message before sending.", status: "not-sent" }
    }
    if (this.entries.size >= 10_000) {
      return {
        message: "The send receipt limit was reached. Restart Ernie before sending a new message.",
        status: "not-sent",
      }
    }
    // The microtask starts after reservation, so concurrent calls share one dispatch.
    const result = (async (): Promise<SendReceipt> => {
      await Promise.resolve()
      if (!prepare) {
        return {
          message: "Ernie did not receive this send. Your message was not sent; try again.",
          status: "not-sent",
        }
      }
      let dispatch: () => Promise<SendReceipt>
      try {
        dispatch = await prepare()
      } catch (error) {
        if (error instanceof HistoryFailure) {
          return { message: `${error.message} ${error.nextAction}`, status: "not-sent" }
        }
        return {
          message: "The connection was not ready. Your message was not sent; try again.",
          status: "not-sent",
        }
      }
      try {
        return await dispatch()
      } catch {
        return {
          message:
            "Prime Agent did not confirm this send. It may already have the message. Check the conversation before sending it again.",
          status: "unknown",
        }
      }
    })()
    this.entries.set(request.commandId, { fingerprint, result })
    return await result
  }
}
