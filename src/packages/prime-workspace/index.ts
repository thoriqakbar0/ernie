import { createChatSession, type ChatSession } from "../chat-session"
import type {
  PrimeAgentClient,
  PrimeSessionSnapshot,
} from "../prime-agent"
import {
  createPrimeSessionSyncState,
  getPrimeSessionSnapshotEnvelope,
  reducePrimeSessionChange,
  reducePrimeSessionSnapshot,
} from "../prime-agent/sync"

/** One authoritative Prime Agent snapshot with Ernie's attached chat commands. */
export interface AttachedPrimeSession {
  /** The newest authoritative state accepted from Prime Agent. */
  readonly snapshot: PrimeSessionSnapshot

  /** Commands scoped to this attached session. */
  readonly chat: ChatSession

  /** Observes accepted snapshots after ordered event reconciliation. */
  subscribe(listener: (snapshot: PrimeSessionSnapshot) => void): () => void

  /** Releases the Prime Agent event subscription owned by this attachment. */
  dispose(): void
}

/** Session discovery and attachment operations used by Ernie. */
export interface PrimeWorkspace {
  /** Creates and attaches one new Prime Agent session. */
  createSession(input: Readonly<{ cwd: string; name?: string }>): Promise<AttachedPrimeSession>

  /** Attaches an existing session and recovers any event race from a snapshot. */
  attachSession(sessionId: string): Promise<AttachedPrimeSession>
}

/** Dependencies controlled by Ernie's main-process composition root. */
export type PrimeWorkspaceDependencies = Readonly<{
  primeAgent: PrimeAgentClient
  createId: () => string
}>

/** Creates Ernie's session discovery and attachment service. */
export function createPrimeWorkspace({
  primeAgent,
  createId,
}: PrimeWorkspaceDependencies): PrimeWorkspace {
  const attach = async (sessionId: string) => {
    let sync = createPrimeSessionSyncState(sessionId)
    const listeners = new Set<(next: PrimeSessionSnapshot) => void>()
    let disposed = false
    let recoveryPromise: Promise<void> | undefined
    let displayedSnapshot: PrimeSessionSnapshot | undefined

    const publish = (snapshot: PrimeSessionSnapshot) => {
      if (snapshot === displayedSnapshot) return
      displayedSnapshot = snapshot
      for (const listener of listeners) listener(snapshot)
    }

    const publishAuthoritativeSnapshot = () => {
      const envelope = getPrimeSessionSnapshotEnvelope(sync)
      if (envelope) publish(envelope.snapshot)
    }

    const synchronize = async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const envelope = await primeAgent.attachSession({ sessionId })
        sync = reducePrimeSessionSnapshot(sync, envelope)
        if (sync.status === "ready") {
          publishAuthoritativeSnapshot()
          return
        }
      }
      throw new Error("Prime Agent session synchronization did not converge")
    }

    const beginRecovery = () => {
      if (disposed || recoveryPromise) return
      const recovery = synchronize().catch((cause: unknown) => {
        if (disposed) return
        const envelope = getPrimeSessionSnapshotEnvelope(sync)
        if (!envelope) return
        publish({
          ...envelope.snapshot,
          session: { ...envelope.snapshot.session, state: "recovering" },
          transport: {
            status: "failed",
            error: cause instanceof Error
              ? cause.message
              : "Prime Agent session recovery failed",
          },
        })
      })
      const tracked = recovery.then(() => {
        if (recoveryPromise === tracked) recoveryPromise = undefined
      })
      recoveryPromise = tracked
    }

    const unsubscribePrimeAgent = primeAgent.subscribeSession(sessionId, (event) => {
      sync = event.type === "snapshot"
        ? reducePrimeSessionSnapshot(sync, event.envelope)
        : reducePrimeSessionChange(sync, event.envelope)
      if (sync.status === "recovering") {
        beginRecovery()
      } else {
        publishAuthoritativeSnapshot()
      }
    })

    try {
      await synchronize()
    } catch (error) {
      disposed = true
      unsubscribePrimeAgent()
      throw error
    }
    const initialEnvelope = getPrimeSessionSnapshotEnvelope(sync)
    if (!initialEnvelope) {
      disposed = true
      unsubscribePrimeAgent()
      throw new Error("Prime Agent attachment completed without a snapshot")
    }
    displayedSnapshot = initialEnvelope.snapshot
    const chat = createChatSession({
      primeAgent,
      sessionId: initialEnvelope.sessionId,
      createId,
    })

    return {
      get snapshot() {
        if (!displayedSnapshot) throw new Error("Prime Agent session snapshot is unavailable")
        return displayedSnapshot
      },
      chat,
      subscribe(listener: (next: PrimeSessionSnapshot) => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      dispose() {
        disposed = true
        listeners.clear()
        unsubscribePrimeAgent()
      },
    }
  }

  return {
    async createSession(input) {
      const session = await primeAgent.createSession(input)
      return attach(session.id)
    },

    attachSession: attach,
  }
}
