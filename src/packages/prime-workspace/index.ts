import { createChatSession } from "../chat-session"
import type { ChatSession } from "../chat-session"
import type { PrimeAgentClient, PrimeSessionSnapshot } from "../prime-agent"
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
  subscribe: (listener: (snapshot: PrimeSessionSnapshot) => void) => () => void

  /** Releases the Prime Agent event subscription owned by this attachment. */
  dispose: () => void
}

/** Session discovery and attachment operations used by Ernie. */
export interface PrimeWorkspace {
  /** Attaches an existing session and recovers any event race from a snapshot. */
  attachSession: (sessionId: string) => Promise<AttachedPrimeSession>
}

/** Dependencies controlled by Ernie's main-process composition root. */
export type PrimeWorkspaceDependencies = Readonly<{
  primeAgent: PrimeAgentClient
  createId: () => string
}>

/** Creates Ernie's session discovery and attachment service. */
export const createPrimeWorkspace = ({
  primeAgent,
  createId,
}: PrimeWorkspaceDependencies): PrimeWorkspace => {
  const attach = async (sessionId: string) => {
    let sync = createPrimeSessionSyncState(sessionId)
    const listeners = new Set<(next: PrimeSessionSnapshot) => void>()
    let disposed = false
    let recoveryPromise: Promise<void> | undefined
    let displayedSnapshot: PrimeSessionSnapshot | undefined

    const publish = (snapshot: PrimeSessionSnapshot) => {
      if (snapshot === displayedSnapshot) {
        return
      }
      displayedSnapshot = snapshot
      for (const listener of listeners) {
        listener(snapshot)
      }
    }

    const publishAuthoritativeSnapshot = () => {
      const envelope = getPrimeSessionSnapshotEnvelope(sync)
      if (envelope) {
        publish(envelope.snapshot)
      }
    }

    const synchronize = async (attempt = 0): Promise<void> => {
      const envelope = await primeAgent.attachSession({ sessionId })
      sync = reducePrimeSessionSnapshot(sync, envelope)
      if (sync.status === "ready") {
        publishAuthoritativeSnapshot()
        return
      }
      if (attempt < 3) {
        return synchronize(attempt + 1)
      }
      throw new Error("Prime Agent session synchronization did not converge")
    }

    const beginRecovery = () => {
      if (disposed || recoveryPromise) {
        return
      }
      const recover = async () => {
        try {
          await synchronize()
        } catch (error) {
          if (disposed) {
            return
          }
          const envelope = getPrimeSessionSnapshotEnvelope(sync)
          if (!envelope) {
            return
          }
          publish({
            ...envelope.snapshot,
            session: { ...envelope.snapshot.session, state: "recovering" },
            transport: {
              error: error instanceof Error ? error.message : "Prime Agent session recovery failed",
              status: "failed",
            },
          })
        } finally {
          recoveryPromise = undefined
        }
      }
      recoveryPromise = recover()
    }

    const unsubscribePrimeAgent = primeAgent.subscribeSession(sessionId, (event) => {
      sync =
        event.type === "snapshot"
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
      createId,
      primeAgent,
      sessionId: initialEnvelope.sessionId,
    })

    return {
      chat,
      dispose() {
        disposed = true
        listeners.clear()
        unsubscribePrimeAgent()
      },
      get snapshot() {
        if (!displayedSnapshot) {
          throw new Error("Prime Agent session snapshot is unavailable")
        }
        return displayedSnapshot
      },
      subscribe(listener: (next: PrimeSessionSnapshot) => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
  }

  return {
    attachSession: attach,
  }
}
