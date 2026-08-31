import type {
  PromptAdmission,
  PrimeAgentClient,
} from "../prime-agent"

/** The caller-visible result of trying to submit the current draft. */
export type SubmitDraftResult =
  | Readonly<{ status: "admitted"; admission: PromptAdmission }>
  | Readonly<{ status: "ignored"; reason: "empty" | "pending" }>

/** Coordinates draft ownership with Prime Agent. */
export interface ChatSession {
  /** Submits a non-empty draft once and waits for Prime Agent admission. */
  submitDraft(content: string): Promise<SubmitDraftResult>

  /** Queues a non-empty follow-up for the active turn. */
  followUp(content: string): Promise<"queued" | "ignored-empty">

  /** Requests that Prime Agent stop active work. */
  stop(): Promise<void>
}

/** Dependencies controlled by Ernie's composition root. */
export type ChatSessionDependencies = Readonly<{
  primeAgent: PrimeAgentClient
  sessionId: string
  createId: () => string
}>

/** Creates one chat session coordinator with a single pending admission. */
export function createChatSession({
  primeAgent,
  sessionId,
  createId,
}: ChatSessionDependencies): ChatSession {
  let admissionPending = false

  return {
    async submitDraft(content) {
      if (!content.trim()) {
        return { status: "ignored", reason: "empty" }
      }

      if (admissionPending) {
        return { status: "ignored", reason: "pending" }
      }

      admissionPending = true

      try {
        const admission = await primeAgent.prompt({
          sessionId,
          admissionId: createId(),
          commandId: createId(),
          content,
        })

        return { status: "admitted", admission }
      } finally {
        admissionPending = false
      }
    },

    async followUp(content) {
      if (!content.trim()) return "ignored-empty"

      await primeAgent.followUp({ sessionId, content })
      return "queued"
    },

    async stop() {
      await primeAgent.abort({ sessionId })
      await primeAgent.waitForIdle({ sessionId })
    },
  }
}
