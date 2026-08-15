import { Effect, Queue, Stream } from 'effect';

import {
  isJsonBoolean,
  isJsonRecord,
  isJsonString,
  parseJsonValue,
  type JsonRecord,
  type JsonValue,
} from '../../json-value/index.js';
import type {
  PrimeAgentFailure,
  PrimeAgentRlmDepth,
  PrimeAgentSessionFeedItem,
  PrimeAgentSessionView,
} from '../types.js';
import { parseRlmDepthData, parseSessionViewData } from './protocol.js';

/** Narrow Prime Agent connection capabilities owned by the session feed. */
export interface PrimeAgentSessionFeedConnection {
  readonly dispose: () => Promise<void>;
  readonly getInitialSnapshot: () => Promise<unknown>;
  readonly getRlmMaxDepthStatus: () => Promise<unknown>;
  readonly subscribe: (
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The adapter parses each external Prime Agent event before projection.
    listener: (event: unknown) => void | Promise<void>,
  ) => () => void;
}

/** External connection factory and safe reporting capability for one feed. */
export interface PrimeAgentSessionFeedDependencies {
  readonly openConnection: (
    activeSessionId: string,
  ) => Effect.Effect<PrimeAgentSessionFeedConnection, unknown>;
  readonly reportFailure: (scope: string, cause: unknown) => void;
}

interface SessionProjection {
  readonly activeSessionId: string;
  readonly children: readonly JsonValue[];
  readonly depth: PrimeAgentRlmDepth;
  readonly messages: readonly JsonValue[];
  readonly pendingToolResults: ReadonlyMap<string, JsonRecord>;
  readonly state: JsonRecord;
  readonly streamingMessage: JsonRecord | null;
}

type FeedAccumulator =
  | Readonly<{ kind: 'open'; projection: SessionProjection }>
  | Readonly<{ kind: 'closed' }>;

interface ProjectionStep {
  readonly projection: SessionProjection;
  readonly items: readonly PrimeAgentSessionFeedItem[];
}

const protocolFailure: PrimeAgentFailure = {
  code: 'protocol_error',
  message: 'Prime Agent returned an invalid live session event.',
};

function depthValue(depth: PrimeAgentRlmDepth): JsonRecord {
  return { maxDepth: depth.maxDepth, source: depth.source };
}

function closedItem(failure: PrimeAgentFailure): PrimeAgentSessionFeedItem {
  return { kind: 'closed', failure };
}

function recordField(value: JsonValue | undefined): JsonRecord | null {
  return isJsonRecord(value) ? value : null;
}

function initialProjection(
  activeSessionId: string,
  snapshotValue: JsonValue | undefined,
  depthValue: JsonValue | undefined,
): SessionProjection | null {
  if (!isJsonRecord(snapshotValue)) return null;
  const state = recordField(snapshotValue.state);
  const depth = parseRlmDepthData(depthValue);
  if (state === null || !Array.isArray(snapshotValue.messages) || !depth.ok) {
    return null;
  }
  const children = snapshotValue.children;
  if (children !== undefined && !Array.isArray(children)) return null;
  const streamingMessage = snapshotValue.streamingMessage;
  if (streamingMessage !== undefined && !isJsonRecord(streamingMessage)) {
    return null;
  }
  return {
    activeSessionId,
    children: children ?? [],
    depth: depth.value,
    messages: snapshotValue.messages,
    pendingToolResults: new Map(),
    state,
    streamingMessage: streamingMessage ?? null,
  };
}

function projectionView(
  projection: SessionProjection,
): PrimeAgentSessionView | null {
  const visibleMessages = [
    ...projection.messages,
    ...(projection.streamingMessage === null
      ? []
      : [projection.streamingMessage]),
    ...projection.pendingToolResults.values(),
  ];
  const result = parseSessionViewData(
    {
      snapshot: {
        activeSessionId: projection.activeSessionId,
        children: projection.children,
        messages: visibleMessages,
        state: projection.state,
      },
    },
    depthValue(projection.depth),
  );
  return result.ok ? result.value : null;
}

function conversationItem(
  projection: SessionProjection,
): PrimeAgentSessionFeedItem | null {
  const view = projectionView(projection);
  return view === null
    ? null
    : {
        kind: 'conversation-replaced',
        isStreaming: view.isStreaming,
        messages: view.messages,
        transcript: view.transcript,
      };
}

function spawnedSessionsItem(
  projection: SessionProjection,
): PrimeAgentSessionFeedItem | null {
  const view = projectionView(projection);
  return view === null
    ? null
    : {
        kind: 'spawned-sessions-replaced',
        sessions: view.spawnedSessions,
      };
}

function snapshotItem(
  projection: SessionProjection,
): PrimeAgentSessionFeedItem | null {
  const view = projectionView(projection);
  return view === null
    ? null
    : { kind: 'snapshot', previousHistoryStart: null, view };
}

function withStreamingState(
  projection: SessionProjection,
  isStreaming: boolean,
): SessionProjection {
  return {
    ...projection,
    state: { ...projection.state, isStreaming },
  };
}

function parseEventRecord(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This parser owns the external Prime Agent event boundary.
  event: unknown,
): JsonRecord | null {
  const value = parseJsonValue(event);
  return isJsonRecord(value) ? value : null;
}

function toolResultMessage(
  event: JsonRecord,
  previous: JsonRecord | undefined,
  status: 'starting' | 'finished',
): JsonRecord | null {
  if (
    !isJsonString(event.toolCallId) ||
    !isJsonString(event.toolName)
  ) {
    return null;
  }
  const result = recordField(
    status === 'finished' ? event.result : event.partialResult,
  );
  const previousDetails = recordField(previous?.details) ?? {};
  const nextDetails = recordField(result?.details) ?? {};
  const details = status === 'starting'
    ? { ...previousDetails, ...nextDetails, status: 'starting' }
    : { ...previousDetails, ...nextDetails };
  const content = result?.content;
  return {
    content: Array.isArray(content) ? content : (previous?.content ?? []),
    details,
    isError:
      status === 'finished' && isJsonBoolean(event.isError)
        ? event.isError
        : false,
    role: 'toolResult',
    toolCallId: event.toolCallId,
    toolName: event.toolName,
  };
}

function applySessionEvent(
  projection: SessionProjection,
  event: JsonRecord,
): ProjectionStep | null {
  const type = event.type;
  if (!isJsonString(type)) return null;

  if (type === 'agent_start') {
    const next = withStreamingState(projection, true);
    const item = conversationItem(next);
    return item === null ? null : { projection: next, items: [item] };
  }
  if (type === 'agent_end') {
    const messages = projection.streamingMessage === null
      ? projection.messages
      : [
          ...projection.messages,
          projection.streamingMessage,
          ...projection.pendingToolResults.values(),
        ];
    const next = {
      ...withStreamingState(projection, false),
      messages,
      pendingToolResults: new Map<string, JsonRecord>(),
      streamingMessage: null,
    };
    const item = conversationItem(next);
    return item === null ? null : { projection: next, items: [item] };
  }
  if (type === 'message_start' || type === 'message_update' || type === 'message_end') {
    const message = recordField(event.message);
    if (message === null || !isJsonString(message.role)) return null;
    let next = withStreamingState(projection, true);
    if (message.role === 'user' && type === 'message_start') {
      next = { ...next, messages: [...next.messages, message] };
    } else if (message.role === 'assistant') {
      next = { ...next, streamingMessage: message };
    }
    const item = conversationItem(next);
    return item === null ? null : { projection: next, items: [item] };
  }
  if (type === 'tool_execution_start' || type === 'tool_execution_update') {
    if (!isJsonString(event.toolCallId)) return null;
    const previous = projection.pendingToolResults.get(event.toolCallId);
    const message = toolResultMessage(event, previous, 'starting');
    if (message === null) return null;
    const pendingToolResults = new Map(projection.pendingToolResults);
    pendingToolResults.set(event.toolCallId, message);
    const next = { ...projection, pendingToolResults };
    const item = conversationItem(next);
    return item === null ? null : { projection: next, items: [item] };
  }
  if (type === 'tool_execution_end') {
    if (!isJsonString(event.toolCallId)) return null;
    const previous = projection.pendingToolResults.get(event.toolCallId);
    const message = toolResultMessage(event, previous, 'finished');
    if (message === null) return null;
    const pendingToolResults = new Map(projection.pendingToolResults);
    pendingToolResults.set(event.toolCallId, message);
    const next = { ...projection, pendingToolResults };
    const item = conversationItem(next);
    return item === null ? null : { projection: next, items: [item] };
  }
  if (type === 'turn_end') {
    const message = recordField(event.message);
    if (message === null || !Array.isArray(event.toolResults)) return null;
    const next = {
      ...projection,
      messages: [...projection.messages, message, ...event.toolResults],
      pendingToolResults: new Map<string, JsonRecord>(),
      streamingMessage: null,
    };
    const item = conversationItem(next);
    return item === null ? null : { projection: next, items: [item] };
  }
  if (type === 'session_info_changed') {
    if (event.name !== undefined && !isJsonString(event.name)) return null;
    const sessionName = isJsonString(event.name) ? event.name.trim() : null;
    if (sessionName === '') return null;
    const state = { ...projection.state };
    if (sessionName === null) {
      delete state.sessionName;
    } else {
      state.sessionName = sessionName;
    }
    const next = {
      ...projection,
      state,
    };
    return {
      projection: next,
      items: [{ kind: 'session-name-changed', sessionName }],
    };
  }
  if (type === 'rlm_child_update') {
    const child = recordField(event.child);
    if (child === null || !isJsonString(child.id)) return null;
    const children = projection.children.filter(
      (candidate) => !isJsonRecord(candidate) || candidate.id !== child.id,
    );
    const next = { ...projection, children: [...children, child] };
    const item = spawnedSessionsItem(next);
    return item === null ? null : { projection: next, items: [item] };
  }

  return { projection, items: [] };
}

function applyConnectionEvent(
  accumulator: FeedAccumulator,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- parseEventRecord refines this external event before use.
  event: unknown,
): readonly [FeedAccumulator, readonly PrimeAgentSessionFeedItem[]] {
  if (accumulator.kind === 'closed') return [accumulator, []];
  const value = parseEventRecord(event);
  if (value === null || !isJsonString(value.type)) {
    return [{ kind: 'closed' }, [closedItem(protocolFailure)]];
  }

  if (value.type === 'session_event') {
    const sessionEvent = recordField(value.event);
    if (sessionEvent === null) {
      return [{ kind: 'closed' }, [closedItem(protocolFailure)]];
    }
    const step = applySessionEvent(accumulator.projection, sessionEvent);
    return step === null
      ? [{ kind: 'closed' }, [closedItem(protocolFailure)]]
      : [{ kind: 'open', projection: step.projection }, step.items];
  }
  if (value.type === 'session_replaced') {
    const state = recordField(value.state);
    if (state === null || !Array.isArray(value.messages)) {
      return [{ kind: 'closed' }, [closedItem(protocolFailure)]];
    }
    const projection = {
      ...accumulator.projection,
      children: [],
      messages: value.messages,
      pendingToolResults: new Map<string, JsonRecord>(),
      state,
      streamingMessage: null,
    };
    const item = snapshotItem(projection);
    return item === null
      ? [{ kind: 'closed' }, [closedItem(protocolFailure)]]
      : [{ kind: 'open', projection }, [item]];
  }
  if (value.type === 'session_resynced') {
    const projection = initialProjection(
      accumulator.projection.activeSessionId,
      value.snapshot,
      depthValue(accumulator.projection.depth),
    );
    const item = projection === null ? null : snapshotItem(projection);
    return projection === null || item === null
      ? [{ kind: 'closed' }, [closedItem(protocolFailure)]]
      : [{ kind: 'open', projection }, [item]];
  }
  if (value.type === 'connection_status') {
    if (value.status !== 'connected' && value.status !== 'reconnecting') {
      return [{ kind: 'closed' }, [closedItem(protocolFailure)]];
    }
    return [
      accumulator,
      [{
        kind: 'connection-changed',
        status: value.status === 'connected' ? 'live' : 'reconnecting',
      }],
    ];
  }
  if (value.type === 'closed') {
    return [
      { kind: 'closed' },
      [closedItem({
        code: 'daemon_unavailable',
        message: 'The Prime Agent session connection closed.',
      })],
    ];
  }
  return [accumulator, []];
}

function openFailureItem(): PrimeAgentSessionFeedItem {
  return closedItem({
    code: 'daemon_unavailable',
    message: 'Ernie could not open the Prime Agent session stream.',
  });
}

/** Open one buffered, replay-aware Prime Agent session feed. */
export function createPrimeAgentSessionFeed(
  activeSessionId: string,
  dependencies: PrimeAgentSessionFeedDependencies,
): Stream.Stream<PrimeAgentSessionFeedItem> {
  const open = Effect.gen(function* () {
    const connection = yield* Effect.acquireRelease(
      dependencies.openConnection(activeSessionId),
      (activeConnection) =>
        Effect.tryPromise(() => activeConnection.dispose()).pipe(
          Effect.catch((cause) =>
            Effect.sync(() => {
              dependencies.reportFailure(
                'Prime Agent session stream disposal failed.',
                cause,
              );
            }),
          ),
        ),
    );
    const queue = yield* Queue.bounded<unknown>(256);
    const unsubscribe = connection.subscribe((event) =>
      Effect.runPromise(Queue.offer(queue, event)).then(() => undefined),
    );
    yield* Effect.addFinalizer(() =>
      Effect.sync(unsubscribe).pipe(Effect.andThen(Queue.shutdown(queue))),
    );

    const [snapshot, depth] = yield* Effect.all(
      [
        Effect.tryPromise(() => connection.getInitialSnapshot()),
        Effect.tryPromise(() => connection.getRlmMaxDepthStatus()),
      ],
      { concurrency: 'unbounded' },
    );
    const snapshotValue = parseJsonValue(snapshot);
    const depthValue = parseJsonValue(depth);
    const projection = initialProjection(
      activeSessionId,
      snapshotValue,
      depthValue,
    );
    const initial = projection === null ? null : snapshotItem(projection);
    if (projection === null || initial === null) {
      return Stream.succeed(closedItem(protocolFailure));
    }

    const changes = Stream.fromQueue(queue).pipe(
      Stream.mapAccum(
        (): FeedAccumulator => ({ kind: 'open', projection }),
        applyConnectionEvent,
      ),
    );
    return Stream.succeed(initial).pipe(Stream.concat(changes));
  }).pipe(
    Effect.catch((cause) =>
      Effect.sync(() => {
        dependencies.reportFailure('Prime Agent session stream failed.', cause);
        return Stream.succeed(openFailureItem());
      }),
    ),
  );

  return Stream.unwrap(open).pipe(
    Stream.takeUntil((item) => item.kind === 'closed'),
  );
}
