import { Effect, Queue, Stream } from 'effect';

import type {
  PrimeAgentResult,
  PrimeAgentWorkspace,
  PrimeAgentWorkspaceConnection,
  PrimeAgentWorkspaceFeedItem,
} from '../types.js';
import type {
  PrimeAgentControlEvent,
  PrimeAgentControlState,
} from './control-client.js';

const defaultReconciliationIntervalMs = 15_000;

/** Inputs required by the daemon-owned workspace lifecycle. */
export interface PrimeAgentWorkspaceFeedDependencies {
  readonly connectionState: () => PrimeAgentControlState;
  readonly listWorkspace: () => Effect.Effect<
    PrimeAgentResult<PrimeAgentWorkspace>
  >;
  readonly reconciliationIntervalMs?: number;
  readonly subscribeControl: (
    listener: (event: PrimeAgentControlEvent) => void,
  ) => () => void;
}

function visibleConnectionState(
  state: PrimeAgentControlState,
): PrimeAgentWorkspaceConnection {
  if (state === 'ready') return 'ready';
  if (state === 'reconnecting') return 'reconnecting';
  if (state === 'unavailable' || state === 'closed') return 'unavailable';
  return 'connecting';
}

function changesWorkspaceCatalog(event: PrimeAgentControlEvent): boolean {
  if (event.kind !== 'message') return false;
  return (
    event.message.type === 'session_status' ||
    event.message.type === 'session_attached' ||
    event.message.type === 'session_detached' ||
    event.message.type === 'session_closed'
  );
}

/** Stream workspace snapshots from daemon events with periodic reconciliation. */
export function createPrimeAgentWorkspaceFeed(
  dependencies: PrimeAgentWorkspaceFeedDependencies,
): Stream.Stream<PrimeAgentWorkspaceFeedItem> {
  const open = Effect.gen(function* () {
    const output = yield* Queue.sliding<PrimeAgentWorkspaceFeedItem>(32);
    const refreshRequests = yield* Queue.sliding<void>(1);
    let lastConnection: PrimeAgentWorkspaceConnection | null = null;
    let lastWorkspace = '';

    const emitConnection = (status: PrimeAgentWorkspaceConnection): void => {
      if (lastConnection === status) return;
      lastConnection = status;
      Queue.offerUnsafe(output, { kind: 'connection-changed', status });
    };
    const requestRefresh = (): void => {
      Queue.offerUnsafe(refreshRequests, undefined);
    };
    const refresh = dependencies.listWorkspace().pipe(
      Effect.flatMap((result) =>
        Effect.sync(() => {
          if (!result.ok) {
            emitConnection(visibleConnectionState(dependencies.connectionState()));
            return;
          }
          const fingerprint = JSON.stringify(result.value);
          if (fingerprint !== lastWorkspace) {
            lastWorkspace = fingerprint;
            Queue.offerUnsafe(output, {
              kind: 'workspace-replaced',
              workspace: result.value,
            });
          }
          emitConnection('ready');
        }),
      ),
    );

    yield* Stream.fromQueue(refreshRequests).pipe(
      Stream.mapEffect(() => refresh),
      Stream.runDrain,
      Effect.forkScoped,
    );

    const unsubscribe = dependencies.subscribeControl((event) => {
      if (event.kind === 'connection-changed') {
        if (event.state === 'ready') requestRefresh();
        else emitConnection(visibleConnectionState(event.state));
      }
      if (changesWorkspaceCatalog(event)) requestRefresh();
    });
    yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));

    const reconciliationInterval = setInterval(
      requestRefresh,
      dependencies.reconciliationIntervalMs ?? defaultReconciliationIntervalMs,
    );
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => clearInterval(reconciliationInterval)),
    );
    yield* Effect.addFinalizer(() =>
      Queue.shutdown(refreshRequests).pipe(Effect.andThen(Queue.shutdown(output))),
    );

    requestRefresh();
    return Stream.fromQueue(output);
  });

  return Stream.unwrap(open);
}
