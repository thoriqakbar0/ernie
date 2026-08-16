import { Effect, Fiber } from 'effect';

import { createAgentSessionViewCache } from '../../ernie-daemon/session-view-cache.js';
import type {
  PrimeAgentResult,
  PrimeAgentSessionHistoryPage,
  PrimeAgentSessionHistoryRequest,
  PrimeAgentSessionView,
} from '../../prime-agent-daemon/client.js';
import {
  prependPrimeAgentSessionHistory,
  primeAgentSessionFeedView,
  type PrimeAgentSessionFeedState,
} from '../../prime-agent-daemon/events.js';

/** Narrow daemon operation required by earlier-history loading. */
export interface AgentSessionHistoryPort {
  readonly loadHistory: (
    request: PrimeAgentSessionHistoryRequest,
  ) => Promise<PrimeAgentResult<PrimeAgentSessionHistoryPage>>;
}

/** React-neutral callbacks used to publish one history transition. */
export interface AgentSessionHistoryCallbacks {
  readonly currentFeed: () => PrimeAgentSessionFeedState | null;
  readonly onFeed: (feed: PrimeAgentSessionFeedState) => void;
  readonly onFinished: () => void;
  readonly onStarted: () => void;
  readonly onStatus: (message: string) => void;
}

/** Cache and owned asynchronous work for focused Agent sessions. */
export interface AgentSessionLifecycle {
  readonly cancelEarlierHistory: (activeSessionId?: string) => void;
  readonly close: () => void;
  readonly loadEarlierHistory: (
    port: AgentSessionHistoryPort,
    view: PrimeAgentSessionView,
    callbacks: AgentSessionHistoryCallbacks,
  ) => boolean;
  readonly peek: (activeSessionId: string) => PrimeAgentSessionView | null;
  readonly put: (view: PrimeAgentSessionView) => void;
  readonly read: (activeSessionId: string) => PrimeAgentSessionView | null;
}

interface OwnedEarlierHistoryLoad {
  readonly activeSessionId: string;
  readonly callbacks: AgentSessionHistoryCallbacks;
  fiber: Fiber.Fiber<void> | null;
}

/** Create one lifecycle owner for a renderer workspace adapter. */
export function createAgentSessionLifecycle(): AgentSessionLifecycle {
  const cache = createAgentSessionViewCache();
  let owner: OwnedEarlierHistoryLoad | null = null;

  const cancelEarlierHistory = (activeSessionId?: string): void => {
    if (
      owner === null ||
      (activeSessionId !== undefined && owner.activeSessionId !== activeSessionId)
    ) {
      return;
    }
    const cancelled = owner;
    owner = null;
    if (cancelled.fiber !== null) {
      Effect.runFork(Fiber.interrupt(cancelled.fiber));
    }
    cancelled.callbacks.onFinished();
  };

  return {
    cancelEarlierHistory,
    close() {
      cancelEarlierHistory();
      cache.clear();
    },
    loadEarlierHistory(port, view, callbacks) {
      if (owner !== null || view.historyStart === 0) return false;
      const activeSessionId = view.activeSessionId;
      const before = view.historyStart;
      const owned: OwnedEarlierHistoryLoad = {
        activeSessionId,
        callbacks,
        fiber: null,
      };
      owner = owned;
      callbacks.onStarted();

      const load = Effect.tryPromise(() =>
        port.loadHistory({ activeSessionId, before })
      ).pipe(
        Effect.flatMap((result) =>
          Effect.sync(() => {
            if (owner !== owned) return;
            if (!result.ok) {
              callbacks.onStatus(result.error.message);
              return;
            }
            const current = callbacks.currentFeed();
            if (
              current === null ||
              current.activeSessionId !== activeSessionId
            ) {
              return;
            }
            const next = prependPrimeAgentSessionHistory(current, result.value);
            const nextView = primeAgentSessionFeedView(next);
            if (nextView !== null) cache.put(nextView);
            callbacks.onFeed(next);
            callbacks.onStatus('Loaded earlier Agent history.');
          }),
        ),
        Effect.catch(() =>
          Effect.sync(() => {
            if (owner === owned) {
              callbacks.onStatus('Ernie could not load earlier Agent history.');
            }
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (owner !== owned) return;
            owner = null;
            callbacks.onFinished();
          }),
        ),
      );
      owned.fiber = Effect.runFork(load);
      return true;
    },
    peek: cache.peek,
    put: cache.put,
    read: cache.read,
  };
}
