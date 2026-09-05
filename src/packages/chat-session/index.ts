import type { PrimeAgentClient, SendRequest, SendReceipt } from "../prime-agent"

/** Delivery outcome and the exact content it describes. */
export type SubmitDraftResult = SendReceipt & Readonly<{ content: string }>

/** Owns send identity across prompt, queue, and acknowledgement recovery. */
export interface ChatSession {
  /** Sends a draft, or recovers the unresolved send without replacing its payload. */
  submitDraft(content: string): Promise<SubmitDraftResult>
  /** Queues a follow-up, or recovers the unresolved send with its original mode. */
  followUp(content: string): Promise<SubmitDraftResult>
  /** Explicitly releases uncertainty after the user checks the conversation. */
  releaseUncertainSend(): void
  /** Requests cancellation, independently of send acknowledgement. */
  stop(): Promise<void>
}

/** Dependencies controlled by Ernie's composition root. */
export type ChatSessionDependencies = Readonly<{
  primeAgent: Pick<PrimeAgentClient, "getSendEpoch" | "sendMessage" | "checkSend" | "abort" | "waitForIdle">
  sessionId: string
  createId: () => string
}>

/** Coordinates one immutable send and shares concurrent callers' result. */
export function createChatSession({ primeAgent, sessionId, createId }: ChatSessionDependencies): ChatSession {
  let unresolved: SendRequest | undefined
  let pending: Promise<SubmitDraftResult> | undefined
  const send = (content: string, mode: SendRequest["mode"]): Promise<SubmitDraftResult> => {
    if (pending) return pending
    const operation = async (): Promise<SubmitDraftResult> => {
      const recovering = unresolved !== undefined
      if (!unresolved) {
        if (!content.trim()) return { status: "not-sent", content, message: "Write a message before sending." }
        let epoch: string
        try { epoch = await primeAgent.getSendEpoch() }
        catch { return { status: "not-sent", content, message: "The connection was not ready. Your message was not sent; try again." } }
        unresolved = { epoch, commandId: createId(), sessionId, content, mode }
      }
      const request = unresolved
      let receipt: SendReceipt
      try { receipt = await (recovering ? primeAgent.checkSend(request) : primeAgent.sendMessage(request)) }
      catch { receipt = { status: "unknown", message: "The send acknowledgement was lost. Check send to recover its result without sending again." } }
      if (receipt.status !== "unknown") unresolved = undefined
      return { ...receipt, content: request.content }
    }
    pending = operation().finally(() => { pending = undefined })
    return pending
  }
  return {
    submitDraft: (content) => send(content, "prompt"),
    followUp: (content) => send(content, "follow-up"),
    releaseUncertainSend() { if (!pending) unresolved = undefined },
    async stop() {
      await primeAgent.abort({ sessionId })
      await primeAgent.waitForIdle({ sessionId })
    },
  }
}
