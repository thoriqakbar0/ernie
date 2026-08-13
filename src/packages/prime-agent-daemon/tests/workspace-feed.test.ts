import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DaemonOutbound } from 'prime-agent' with {
  'resolution-mode': 'import',
};
import { Effect, Stream } from 'effect';

import {
  createPrimeAgentWorkspaceFeed,
  type PrimeAgentControlEvent,
} from '../server';

const emptyWorkspace = {
  currentCwd: '/workspace',
  sessions: [],
} as const;

test('refreshes the workspace immediately after a daemon session change', async () => {
  let listener: ((event: PrimeAgentControlEvent) => void) | null = null;
  let calls = 0;
  const changedWorkspace = {
    currentCwd: '/workspace',
    sessions: [
      {
        activeSessionId: 'agent-1',
        activity: 'working' as const,
        cwd: '/workspace',
        model: null,
        modifiedAt: null,
        name: 'Agent 1',
        sessionPath: null,
      },
    ],
  };
  const feed = createPrimeAgentWorkspaceFeed({
    connectionState: () => 'ready',
    listWorkspace: () =>
      Effect.sync(() => {
        calls += 1;
        if (calls === 1) {
          queueMicrotask(() => {
            const message = {
              activeSessionId: 'agent-1',
              type: 'session_status',
            } as DaemonOutbound;
            listener?.({ kind: 'message', message });
          });
        }
        return {
          ok: true as const,
          value: calls === 1 ? emptyWorkspace : changedWorkspace,
        };
      }),
    reconciliationIntervalMs: 60_000,
    subscribeControl: (next) => {
      listener = next;
      next({ kind: 'connection-changed', state: 'cold' });
      return () => {
        listener = null;
      };
    },
  });

  const items = await Effect.runPromise(
    feed.pipe(Stream.take(4), Stream.runCollect),
  );

  assert.deepEqual(Array.from(items), [
    { kind: 'connection-changed', status: 'connecting' },
    { kind: 'workspace-replaced', workspace: emptyWorkspace },
    { kind: 'connection-changed', status: 'ready' },
    { kind: 'workspace-replaced', workspace: changedWorkspace },
  ]);
  assert.equal(calls, 2);
});

test('reconciles missed events without polling the renderer', async () => {
  let calls = 0;
  const feed = createPrimeAgentWorkspaceFeed({
    connectionState: () => 'ready',
    listWorkspace: () =>
      Effect.sync(() => {
        calls += 1;
        return {
          ok: true as const,
          value: {
            ...emptyWorkspace,
            sessions: calls === 1
              ? []
              : [
                  {
                    activeSessionId: 'healed-agent',
                    activity: 'idle' as const,
                    cwd: '/workspace',
                    model: null,
                    modifiedAt: null,
                    name: 'Healed Agent',
                    sessionPath: null,
                  },
                ],
          },
        };
      }),
    reconciliationIntervalMs: 5,
    subscribeControl: (listener) => {
      listener({ kind: 'connection-changed', state: 'cold' });
      return () => undefined;
    },
  });

  const items = await Effect.runPromise(
    feed.pipe(Stream.take(4), Stream.runCollect),
  );

  assert.equal(items[3]?.kind, 'workspace-replaced');
  assert.equal(calls, 2);
});
