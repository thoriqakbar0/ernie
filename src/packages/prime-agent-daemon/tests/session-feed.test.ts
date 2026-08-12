import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Deferred, Effect, Fiber, Stream } from 'effect';

import {
  coalescePrimeAgentSessionFeedItems,
  createPrimeAgentSessionFeedState,
  parsePrimeAgentSessionFeedEnvelope,
  primeAgentSessionFeedView,
  reducePrimeAgentSessionFeed,
} from '../events';
import {
  createPrimeAgentSessionFeed,
  type PrimeAgentSessionFeedConnection,
} from '../server';

const initialView = {
  activeSessionId: 'agent-one',
  isStreaming: false,
  messages: [{ id: 'agent-one:0', role: 'user', text: 'Build it' }],
  rlmMaxDepth: 2,
  sessionName: 'Build it',
  spawnedSessions: [],
  transcript: [
    {
      id: 'agent-one:0',
      kind: 'message',
      role: 'user',
      text: 'Build it',
    },
  ],
} as const;

test('hydrates one session feed and applies ordered conversation changes', () => {
  let state = createPrimeAgentSessionFeedState('subscription-one', 'agent-one');
  const snapshot = parsePrimeAgentSessionFeedEnvelope({
    activeSessionId: 'agent-one',
    item: { kind: 'snapshot', view: initialView },
    revision: 0,
    subscriptionId: 'subscription-one',
  });
  assert.equal(snapshot.ok, true);
  if (!snapshot.ok) return;

  state = reducePrimeAgentSessionFeed(state, snapshot.value);
  assert.equal(state.kind, 'live');
  assert.deepEqual(primeAgentSessionFeedView(state), initialView);

  const conversation = parsePrimeAgentSessionFeedEnvelope({
    activeSessionId: 'agent-one',
    item: {
      kind: 'conversation-replaced',
      isStreaming: true,
      messages: [
        { id: 'agent-one:0', role: 'user', text: 'Build it' },
        { id: 'agent-one:1', role: 'assistant', text: 'Working now' },
      ],
      transcript: [
        {
          id: 'agent-one:0',
          kind: 'message',
          role: 'user',
          text: 'Build it',
        },
        {
          id: 'agent-one:1:text:0',
          kind: 'message',
          role: 'assistant',
          text: 'Working now',
        },
      ],
    },
    revision: 1,
    subscriptionId: 'subscription-one',
  });
  assert.equal(conversation.ok, true);
  if (!conversation.ok) return;

  state = reducePrimeAgentSessionFeed(state, conversation.value);
  assert.equal(state.kind, 'live');
  assert.equal(primeAgentSessionFeedView(state)?.isStreaming, true);
  assert.equal(
    primeAgentSessionFeedView(state)?.messages.at(-1)?.text,
    'Working now',
  );
});

test('ignores stale revisions and events from replaced subscriptions', () => {
  const connecting = createPrimeAgentSessionFeedState(
    'subscription-current',
    'agent-one',
  );
  const current = parsePrimeAgentSessionFeedEnvelope({
    activeSessionId: 'agent-one',
    item: { kind: 'snapshot', view: initialView },
    revision: 3,
    subscriptionId: 'subscription-current',
  });
  const stale = parsePrimeAgentSessionFeedEnvelope({
    activeSessionId: 'agent-one',
    item: {
      kind: 'session-name-changed',
      sessionName: 'Stale name',
    },
    revision: 2,
    subscriptionId: 'subscription-current',
  });
  const replaced = parsePrimeAgentSessionFeedEnvelope({
    activeSessionId: 'agent-one',
    item: {
      kind: 'session-name-changed',
      sessionName: 'Wrong subscription',
    },
    revision: 4,
    subscriptionId: 'subscription-old',
  });
  assert.equal(current.ok && stale.ok && replaced.ok, true);
  if (!current.ok || !stale.ok || !replaced.ok) return;

  const live = reducePrimeAgentSessionFeed(connecting, current.value);
  assert.equal(reducePrimeAgentSessionFeed(live, stale.value), live);
  assert.equal(reducePrimeAgentSessionFeed(live, replaced.value), live);
});

test('retains the last view while reconnecting and replaces it after resync', () => {
  let state = createPrimeAgentSessionFeedState('subscription-one', 'agent-one');
  const events = [
    {
      activeSessionId: 'agent-one',
      item: { kind: 'snapshot', view: initialView },
      revision: 0,
      subscriptionId: 'subscription-one',
    },
    {
      activeSessionId: 'agent-one',
      item: { kind: 'connection-changed', status: 'reconnecting' },
      revision: 1,
      subscriptionId: 'subscription-one',
    },
    {
      activeSessionId: 'agent-one',
      item: {
        kind: 'snapshot',
        view: { ...initialView, sessionName: 'Resynchronized Agent' },
      },
      revision: 2,
      subscriptionId: 'subscription-one',
    },
  ] as const;

  for (const event of events) {
    const parsed = parsePrimeAgentSessionFeedEnvelope(event);
    assert.equal(parsed.ok, true);
    if (parsed.ok) state = reducePrimeAgentSessionFeed(state, parsed.value);
  }

  assert.equal(state.kind, 'live');
  assert.equal(
    primeAgentSessionFeedView(state)?.sessionName,
    'Resynchronized Agent',
  );
});

test('rejects malformed feed envelopes at the renderer boundary', () => {
  const result = parsePrimeAgentSessionFeedEnvelope({
    activeSessionId: 'agent-one',
    item: { kind: 'connection-changed', status: 'unknown' },
    revision: -1,
    subscriptionId: '',
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'protocol_error',
      message: 'Ernie received an invalid Prime Agent session event.',
    },
  });
});

test('coalesces only consecutive conversation frames', () => {
  const first = {
    kind: 'conversation-replaced',
    isStreaming: true,
    messages: [{ id: 'first', role: 'assistant', text: 'first' }],
    transcript: [],
  } as const;
  const latest = {
    ...first,
    messages: [{ id: 'latest', role: 'assistant', text: 'latest' }],
  } as const;
  const boundary = {
    kind: 'connection-changed',
    status: 'reconnecting',
  } as const;

  assert.deepEqual(
    coalescePrimeAgentSessionFeedItems([first, latest, boundary, first]),
    [latest, boundary, first],
  );
});

test('projects streaming messages and releases the connection on interruption', () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const listeners = new Set<(
        // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The production adapter contract owns parsing this fake external event.
        event: unknown,
      ) => void | Promise<void>>();
      let disposeCount = 0;
      const connection: PrimeAgentSessionFeedConnection = {
        dispose: async () => {
          disposeCount += 1;
        },
        getInitialSnapshot: async () => ({
          children: [],
          messages: [{ role: 'user', content: 'Build it' }],
          state: {
            activeSessionId: 'agent-one',
            isStreaming: false,
            sessionName: 'Build it',
          },
        }),
        getRlmMaxDepthStatus: async () => ({
          maxDepth: 2,
          source: 'chat',
        }),
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
      const initialReceived = yield* Deferred.make<void>();
      const updateReceived = yield* Deferred.make<void>();
      const settledReceived = yield* Deferred.make<void>();
      let latestText = '';
      const fiber = yield* createPrimeAgentSessionFeed('agent-one', {
        openConnection: () => Effect.succeed(connection),
        reportFailure: () => undefined,
      }).pipe(
        Stream.runForEach((item) => {
          if (item.kind === 'snapshot') {
            return Deferred.succeed(initialReceived, undefined);
          }
          if (item.kind === 'conversation-replaced') {
            latestText = item.messages.at(-1)?.text ?? latestText;
            if (latestText === 'Hello from events') {
              if (!item.isStreaming) {
                return Deferred.succeed(settledReceived, undefined);
              }
              return Deferred.succeed(updateReceived, undefined);
            }
          }
          return Effect.void;
        }),
        Effect.forkChild,
      );

      yield* Deferred.await(initialReceived);
      for (const listener of listeners) {
        yield* Effect.promise(() =>
          Promise.resolve(listener({
            type: 'session_event',
            event: { type: 'agent_start' },
          })),
        );
        yield* Effect.promise(() =>
          Promise.resolve(listener({
            type: 'session_event',
            event: {
              type: 'message_update',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: 'Hello from events' }],
              },
            },
          })),
        );
      }
      yield* Deferred.await(updateReceived).pipe(Effect.timeout('1 second'));
      assert.equal(latestText, 'Hello from events');
      for (const listener of listeners) {
        yield* Effect.promise(() =>
          Promise.resolve(listener({
            type: 'session_event',
            event: { type: 'agent_end', messages: [] },
          })),
        );
      }
      yield* Deferred.await(settledReceived).pipe(Effect.timeout('1 second'));

      yield* Fiber.interrupt(fiber);
      assert.equal(disposeCount, 1);
      assert.equal(listeners.size, 0);
    }),
  ));
