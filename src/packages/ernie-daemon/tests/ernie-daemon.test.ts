import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Deferred, Effect, Stream } from 'effect';

import {
  createErnieDaemon,
  type AgentHarnessAdapter,
} from '../index';

function fakeHarness(): AgentHarnessAdapter {
  const unsupported = () =>
    Effect.succeed({
      ok: false as const,
      error: {
        code: 'unsupported_operation' as const,
        message: 'Unsupported by the test harness.',
      },
    });
  return {
    close: () => undefined,
    createSession: unsupported,
    descriptor: {
      capabilities: ['live-sessions'],
      id: 'test',
      name: 'Test harness',
    },
    getConfiguration: unsupported,
    getRlmDepth: unsupported,
    importSession: unsupported,
    listModels: unsupported,
    listSavedSessions: unsupported,
    listSkills: unsupported,
    listWorkspace: () =>
      Effect.succeed({
        ok: true,
        value: { currentCwd: '/workspace', sessions: [] },
      }),
    refineSession: unsupported,
    renameSession: unsupported,
    sessionFeed: () => Stream.empty,
    setModel: unsupported,
    setThinkingLevel: unsupported,
    setRlmDepth: unsupported,
    submitTask: unsupported,
    workspaceFeed: () => Stream.empty,
  };
}

test('installs one immutable harness behind the Ernie daemon API', async () => {
  const daemon = createErnieDaemon({
    harness: fakeHarness(),
  });

  assert.equal(Object.isFrozen(daemon), true);
  assert.equal(Object.isFrozen(daemon.harness), true);
  assert.equal(daemon.harness.id, 'test');
  assert.deepEqual(await Effect.runPromise(daemon.listWorkspace()), {
    ok: true,
    value: { currentCwd: '/workspace', sessions: [] },
  });
});

test('replays a cached session view before refreshing its harness feed', async () => {
  const firstView = {
    activeSessionId: 'agent-one',
    historyStart: 0,
    isStreaming: false,
    messages: [{ id: 'first', role: 'user' as const, text: 'First view' }],
    rlmMaxDepth: 1,
    sessionName: 'First view',
    spawnedSessions: [],
    transcript: [
      {
        id: 'first',
        kind: 'message' as const,
        role: 'user' as const,
        text: 'First view',
      },
    ],
  };
  const refreshedView = {
    ...firstView,
    messages: [{ id: 'second', role: 'user' as const, text: 'Refreshed view' }],
    sessionName: 'Refreshed view',
    transcript: [
      {
        id: 'second',
        kind: 'message' as const,
        role: 'user' as const,
        text: 'Refreshed view',
      },
    ],
  };
  let nextView = firstView;
  const daemon = createErnieDaemon({
    harness: {
      ...fakeHarness(),
      sessionFeed: () =>
        Stream.succeed({
          kind: 'snapshot' as const,
          previousHistoryStart: null,
          view: nextView,
        }),
    },
  });

  const firstItems = await Effect.runPromise(
    daemon.sessionFeed('agent-one').pipe(Stream.runCollect),
  );
  nextView = refreshedView;
  const warmItems = await Effect.runPromise(
    daemon.sessionFeed('agent-one').pipe(Stream.runCollect),
  );

  assert.deepEqual(Array.from(firstItems), [
    { kind: 'snapshot', previousHistoryStart: null, view: firstView },
  ]);
  assert.deepEqual(Array.from(warmItems), [
    { kind: 'snapshot', previousHistoryStart: null, view: firstView },
    { kind: 'snapshot', previousHistoryStart: 0, view: refreshedView },
  ]);
  daemon.close();
});

test('prewarms visible Agent sessions before their first selection', () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const warmupFinished = yield* Deferred.make<void>();
      let openedConnections = 0;
      const view = {
        activeSessionId: 'agent-one',
        historyStart: 0,
        isStreaming: false,
        messages: [{ id: 'first', role: 'user' as const, text: 'Ready' }],
        rlmMaxDepth: 1,
        sessionName: 'Ready',
        spawnedSessions: [],
        transcript: [
          {
            id: 'first',
            kind: 'message' as const,
            role: 'user' as const,
            text: 'Ready',
          },
        ],
      };
      const daemon = createErnieDaemon({
        harness: {
          ...fakeHarness(),
          sessionFeed: () =>
            Stream.fromEffect(
              Effect.sync(() => {
                openedConnections += 1;
              }),
            ).pipe(
              Stream.flatMap(() =>
                Stream.fromArray([
                  {
                    kind: 'connection-changed' as const,
                    status: 'reconnecting' as const,
                  },
                  {
                    kind: 'snapshot' as const,
                    previousHistoryStart: null,
                    view,
                  },
                ]),
              ),
              Stream.ensuring(Deferred.succeed(warmupFinished, undefined)),
            ),
          workspaceFeed: () =>
            Stream.succeed({
              kind: 'workspace-replaced' as const,
              workspace: {
                currentCwd: '/workspace',
                sessions: [
                  {
                    activeSessionId: 'agent-one',
                    activity: 'idle' as const,
                    cwd: '/workspace',
                    model: null,
                    modifiedAt: null,
                    name: 'Ready',
                    sessionPath: null,
                  },
                ],
              },
            }),
        },
      });

      yield* daemon.workspaceFeed().pipe(Stream.runDrain);
      yield* Deferred.await(warmupFinished).pipe(Effect.timeout('1 second'));
      const selectedItems = yield* daemon
        .sessionFeed('agent-one')
        .pipe(Stream.take(1), Stream.runCollect);

      assert.equal(openedConnections, 1);
      assert.deepEqual(Array.from(selectedItems), [
        { kind: 'snapshot', previousHistoryStart: null, view },
      ]);
      daemon.close();
    }),
  ));

test('finalizes an active warmup before closing its adapter', () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const warmupStarted = yield* Deferred.make<void>();
      const adapterClosed = yield* Deferred.make<void>();
      const shutdownEvents: string[] = [];
      const daemon = createErnieDaemon({
        harness: {
          ...fakeHarness(),
          close: () => {
            shutdownEvents.push('adapter closed');
            Effect.runSync(Deferred.succeed(adapterClosed, undefined));
          },
          sessionFeed: () =>
            Stream.fromEffect(
              Deferred.succeed(warmupStarted, undefined),
            ).pipe(
              Stream.flatMap(() => Stream.never),
              Stream.ensuring(
                Effect.sync(() => {
                  shutdownEvents.push('warmup finalized');
                }),
              ),
            ),
          workspaceFeed: () =>
            Stream.succeed({
              kind: 'workspace-replaced' as const,
              workspace: {
                currentCwd: '/workspace',
                sessions: [
                  {
                    activeSessionId: 'agent-one',
                    activity: 'idle' as const,
                    cwd: '/workspace',
                    model: null,
                    modifiedAt: null,
                    name: 'Ready',
                    sessionPath: null,
                  },
                ],
              },
            }),
        },
      });

      yield* daemon.workspaceFeed().pipe(Stream.runDrain);
      yield* Deferred.await(warmupStarted).pipe(Effect.timeout('1 second'));
      daemon.close();
      yield* Deferred.await(adapterClosed).pipe(Effect.timeout('1 second'));

      assert.deepEqual(shutdownEvents, [
        'warmup finalized',
        'adapter closed',
      ]);
    }),
  ));

test('windows session feeds and pages earlier transcript history', async () => {
  const transcript = Array.from({ length: 170 }, (_, index) => ({
    id: `item-${index}`,
    kind: 'message' as const,
    role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
    text: `Item ${index}`,
  }));
  const messages = transcript.map(({ id, role, text }) => ({ id, role, text }));
  const latestTranscript = [
    ...transcript,
    {
      id: 'item-170',
      kind: 'message' as const,
      role: 'user' as const,
      text: 'Final item',
    },
  ];
  const latestMessages = latestTranscript.map(({ id, role, text }) => ({
    id,
    role,
    text,
  }));
  const updatedTranscript = [
    ...latestTranscript.slice(0, -1),
    {
      id: 'item-170',
      kind: 'message' as const,
      role: 'user' as const,
      text: 'Final item updated',
    },
  ];
  const updatedMessages = updatedTranscript.map(({ id, role, text }) => ({
    id,
    role,
    text,
  }));
  const view = {
    activeSessionId: 'agent-one',
    historyStart: 0,
    isStreaming: true,
    messages,
    rlmMaxDepth: 2,
    sessionName: 'Long session',
    spawnedSessions: [],
    transcript,
  };
  const daemon = createErnieDaemon({
    harness: {
      ...fakeHarness(),
      sessionFeed: () =>
        Stream.fromArray([
          {
            kind: 'snapshot' as const,
            previousHistoryStart: null,
            view,
          },
          {
            kind: 'conversation-replaced' as const,
            isStreaming: false,
            messages: latestMessages,
            transcript: latestTranscript,
          },
          {
            kind: 'conversation-replaced' as const,
            isStreaming: false,
            messages: updatedMessages,
            transcript: updatedTranscript,
          },
        ]),
    },
  });

  const items = Array.from(await Effect.runPromise(
    daemon.sessionFeed('agent-one').pipe(Stream.runCollect),
  ));
  assert.equal(items[0]?.kind, 'snapshot');
  if (items[0]?.kind !== 'snapshot') return;
  assert.equal(items[0].view.historyStart, 90);
  assert.equal(items[0].view.transcript.length, 80);
  assert.equal(items[0].view.transcript[0]?.id, 'item-90');
  assert.equal(items[0].previousHistoryStart, null);
  assert.deepEqual(items[1], {
    from: 170,
    historyStart: 91,
    kind: 'conversation-patched',
    isStreaming: false,
    messages: latestMessages.slice(-80),
    messagesFrom: 0,
    previousHistoryStart: 90,
    transcript: [latestTranscript[170]],
  });
  assert.deepEqual(items[2], {
    from: 170,
    historyStart: 91,
    kind: 'conversation-patched',
    isStreaming: false,
    messages: [updatedMessages[170]],
    messagesFrom: 79,
    previousHistoryStart: 91,
    transcript: [updatedTranscript[170]],
  });

  const page = await Effect.runPromise(
    daemon.loadSessionHistory({ activeSessionId: 'agent-one', before: 90 }),
  );
  assert.equal(page.ok, true);
  if (!page.ok) return;
  assert.equal(page.value.start, 10);
  assert.equal(page.value.transcript.length, 80);
  assert.equal(page.value.transcript[0]?.id, 'item-10');
  assert.equal(page.value.transcript.at(-1)?.id, 'item-89');
  daemon.close();
});

test('rejects invalid harness descriptors', () => {
  assert.throws(
    () =>
      createErnieDaemon({
        harness: {
          ...fakeHarness(),
          descriptor: { capabilities: [], id: ' ', name: 'Test harness' },
        },
      }),
    /must not be empty/u,
  );
  assert.throws(
    () =>
      createErnieDaemon({
        harness: {
          ...fakeHarness(),
          descriptor: {
            capabilities: ['models', 'models'],
            id: 'test',
            name: 'Test harness',
          },
        },
      }),
    /duplicate capabilities/u,
  );
});
