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
        Stream.succeed({ kind: 'snapshot' as const, view: nextView }),
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
    { kind: 'snapshot', view: firstView },
  ]);
  assert.deepEqual(Array.from(warmItems), [
    { kind: 'snapshot', view: firstView },
    { kind: 'snapshot', view: refreshedView },
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
                  { kind: 'snapshot' as const, view },
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
        { kind: 'snapshot', view },
      ]);
      daemon.close();
    }),
  ));

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
