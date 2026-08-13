import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Effect, Stream } from 'effect';

import {
  createErnieDaemon,
  type AgentHarness,
} from '../index';

function fakeHarness(): AgentHarness {
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
    descriptor: {
      capabilities: ['live-sessions'],
      id: 'test',
      name: 'Test harness',
    },
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

test('rejects invalid harness descriptors', () => {
  assert.throws(
    () =>
      createErnieDaemon({
        descriptor: { capabilities: [], id: ' ', name: 'Test harness' },
        harness: fakeHarness(),
      }),
    /must not be empty/u,
  );
  assert.throws(
    () =>
      createErnieDaemon({
        descriptor: {
          capabilities: ['models', 'models'],
          id: 'test',
          name: 'Test harness',
        },
        harness: fakeHarness(),
      }),
    /duplicate capabilities/u,
  );
});
