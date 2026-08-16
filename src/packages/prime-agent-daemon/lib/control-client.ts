import type {
  DaemonCommand,
  DaemonOutbound,
  DaemonResponse,
} from 'prime-agent' with { 'resolution-mode': 'import' };

import { Effect } from 'effect';

/** The Prime Agent client surface required by Ernie's shared control transport. */
export interface PrimeAgentControlTransport {
  readonly isConnected: boolean;
  readonly close: () => void;
  readonly connect: (timeoutMs?: number) => Promise<void>;
  readonly enableAutoReconnect: (options: {
    readonly recoverDaemon: () => Promise<void>;
    readonly timeoutMs?: number;
    readonly onStatus?: (status: PrimeAgentReconnectStatus) => void;
  }) => void;
  readonly onMessage: (listener: (message: DaemonOutbound) => void) => () => void;
  readonly request: (
    command: DaemonCommand,
    timeoutMs?: number,
  ) => Promise<DaemonResponse>;
  readonly waitForHello: (timeoutMs?: number) => Promise<unknown>;
}

/** Observable events emitted by the shared Prime Agent control connection. */
export type PrimeAgentControlEvent =
  | Readonly<{ kind: 'connection-changed'; state: PrimeAgentControlState }>
  | Readonly<{ kind: 'message'; message: DaemonOutbound }>;

/** Prime Agent's transport-recovery states consumed by the shared client. */
export type PrimeAgentReconnectStatus =
  | Readonly<{ status: 'reconnecting'; error: string }>
  | Readonly<{ status: 'connected' }>
  | Readonly<{ status: 'failed'; error: string }>;

/** Truthful lifecycle states for Ernie's Prime Agent control connection. */
export type PrimeAgentControlState =
  | 'cold'
  | 'connecting'
  | 'ready'
  | 'reconnecting'
  | 'unavailable'
  | 'closed';

/** Capabilities that construct and recover one Prime Agent control transport. */
export interface PrimeAgentControlClientDependencies {
  readonly connectTimeoutMs: number;
  readonly createTransport: () => Promise<PrimeAgentControlTransport>;
  readonly recoverDaemon: () => Promise<void>;
  readonly reconnectTimeoutMs: number;
  readonly reportFailure: (scope: string, cause: unknown) => void;
}

/** One shared, reconnecting Prime Agent command client owned by Electron main. */
export interface PrimeAgentControlClient {
  readonly close: () => void;
  readonly request: (
    command: DaemonCommand,
    timeoutMs: number,
  ) => Effect.Effect<DaemonResponse, unknown>;
  readonly state: () => PrimeAgentControlState;
  readonly subscribe: (
    listener: (event: PrimeAgentControlEvent) => void,
  ) => () => void;
  readonly use: <T>(
    operation: (
      transport: PrimeAgentControlTransport,
    ) => Effect.Effect<T, unknown>,
  ) => Effect.Effect<T, unknown>;
}

interface ReadyWaiter {
  readonly reject: (cause: unknown) => void;
  readonly resolve: () => void;
}

class PrimeAgentControlClosedError extends Error {
  readonly _tag = 'PrimeAgentControlClosedError';

  constructor() {
    super('The Prime Agent control client is closed.');
  }
}

class PrimeAgentControlUnavailableError extends Error {
  readonly _tag = 'PrimeAgentControlUnavailableError';
}

/** Create one lazy shared client that delegates recovery to Prime Agent. */
export function createPrimeAgentControlClient(
  dependencies: PrimeAgentControlClientDependencies,
): PrimeAgentControlClient {
  let transport: PrimeAgentControlTransport | null = null;
  let connection: Promise<PrimeAgentControlTransport> | null = null;
  let currentState: PrimeAgentControlState = 'cold';
  let closed = false;
  let activeGeneration = 0;
  const readyWaiters = new Set<ReadyWaiter>();
  const listeners = new Set<(event: PrimeAgentControlEvent) => void>();
  let unsubscribeMessages: (() => void) | null = null;

  const changeState = (state: PrimeAgentControlState): void => {
    if (currentState === state) return;
    currentState = state;
    for (const listener of listeners) {
      listener({ kind: 'connection-changed', state });
    }
  };

  const rejectWaiters = (cause: unknown): void => {
    for (const waiter of readyWaiters) waiter.reject(cause);
    readyWaiters.clear();
  };
  const resolveWaiters = (): void => {
    for (const waiter of readyWaiters) waiter.resolve();
    readyWaiters.clear();
  };

  const onReconnectStatus = (
    generation: number,
    status: PrimeAgentReconnectStatus,
  ): void => {
    if (closed || generation !== activeGeneration) return;
    if (status.status === 'connected') {
      changeState('ready');
      resolveWaiters();
      return;
    }
    if (status.status === 'reconnecting') {
      changeState('reconnecting');
      return;
    }
    changeState('unavailable');
    const failure = new PrimeAgentControlUnavailableError(status.error);
    dependencies.reportFailure('Prime Agent reconnection failed.', failure);
    rejectWaiters(failure);
  };

  const connect = async (): Promise<PrimeAgentControlTransport> => {
    if (closed) throw new PrimeAgentControlClosedError();
    if (transport?.isConnected === true) return transport;
    if (connection !== null) return connection;
    if (transport !== null && currentState === 'reconnecting') {
      await new Promise<void>((resolve, reject) => {
        readyWaiters.add({ reject, resolve });
      });
      if (!transport.isConnected) {
        throw new PrimeAgentControlUnavailableError(
          'Prime Agent did not restore the control connection.',
        );
      }
      return transport;
    }

    changeState('connecting');
    activeGeneration += 1;
    const generation = activeGeneration;
    const attempt = (async () => {
      await dependencies.recoverDaemon();
      const next = await dependencies.createTransport();
      const stopMessages = next.onMessage((message) => {
        if (generation !== activeGeneration) return;
        for (const listener of listeners) listener({ kind: 'message', message });
      });
      next.enableAutoReconnect({
        onStatus: (status) => onReconnectStatus(generation, status),
        recoverDaemon: dependencies.recoverDaemon,
        timeoutMs: dependencies.reconnectTimeoutMs,
      });
      try {
        await next.connect(dependencies.connectTimeoutMs);
        await next.waitForHello(dependencies.connectTimeoutMs);
      } catch (cause) {
        stopMessages();
        next.close();
        throw cause;
      }
      if (closed) {
        stopMessages();
        next.close();
        throw new PrimeAgentControlClosedError();
      }
      const previousTransport = transport;
      const stopPreviousMessages = unsubscribeMessages;
      transport = next;
      unsubscribeMessages = stopMessages;
      stopPreviousMessages?.();
      if (previousTransport !== null && previousTransport !== next) {
        previousTransport.close();
      }
      changeState('ready');
      resolveWaiters();
      return next;
    })();
    connection = attempt;
    try {
      return await attempt;
    } catch (cause) {
      if (generation === activeGeneration) {
        activeGeneration += 1;
        if (!closed) changeState('unavailable');
      }
      dependencies.reportFailure('Prime Agent connection failed.', cause);
      rejectWaiters(cause);
      throw cause;
    } finally {
      if (connection === attempt) connection = null;
    }
  };

  return {
    close(): void {
      if (closed) return;
      closed = true;
      activeGeneration += 1;
      changeState('closed');
      unsubscribeMessages?.();
      unsubscribeMessages = null;
      transport?.close();
      transport = null;
      rejectWaiters(new PrimeAgentControlClosedError());
    },
    request: (command, timeoutMs) =>
      Effect.tryPromise(async () => {
        const activeTransport = await connect();
        return activeTransport.request(command, timeoutMs);
      }),
    state: () => currentState,
    subscribe(listener): () => void {
      listeners.add(listener);
      listener({ kind: 'connection-changed', state: currentState });
      return () => listeners.delete(listener);
    },
    use: (operation) =>
      Effect.tryPromise(() => connect()).pipe(
        Effect.flatMap(operation),
      ),
  };
}
