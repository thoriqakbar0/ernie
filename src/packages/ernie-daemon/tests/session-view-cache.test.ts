import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AgentSessionView } from '../client';
import { createAgentSessionViewCache } from '../session-view-cache';

function sessionView(
  activeSessionId: string,
  text: string,
): AgentSessionView {
  return {
    activeSessionId,
    isStreaming: false,
    messages: [{ id: `${activeSessionId}:message`, role: 'user', text }],
    rlmMaxDepth: 1,
    sessionName: text,
    spawnedSessions: [],
    transcript: [
      {
        id: `${activeSessionId}:message`,
        kind: 'message',
        role: 'user',
        text,
      },
    ],
  };
}

test('retains complete views and applies incremental feed changes', () => {
  const cache = createAgentSessionViewCache({ maximumEntries: 2 });
  const first = sessionView('first', 'First task');
  cache.apply('first', { kind: 'snapshot', view: first });
  cache.apply('first', {
    kind: 'conversation-replaced',
    isStreaming: true,
    messages: [{ id: 'first:reply', role: 'assistant', text: 'Working' }],
    transcript: [
      {
        id: 'first:reply',
        kind: 'message',
        role: 'assistant',
        text: 'Working',
      },
    ],
  });
  cache.apply('first', { kind: 'session-name-changed', sessionName: 'Warm' });
  cache.apply('first', {
    kind: 'connection-changed',
    status: 'reconnecting',
  });

  assert.deepEqual(cache.peek('first'), {
    ...first,
    isStreaming: true,
    messages: [{ id: 'first:reply', role: 'assistant', text: 'Working' }],
    sessionName: 'Warm',
    transcript: [
      {
        id: 'first:reply',
        kind: 'message',
        role: 'assistant',
        text: 'Working',
      },
    ],
  });
});

test('evicts the least recently used view and rejects crossed identities', () => {
  const cache = createAgentSessionViewCache({ maximumEntries: 2 });
  cache.put(sessionView('first', 'First'));
  cache.put(sessionView('second', 'Second'));
  assert.equal(cache.read('first')?.sessionName, 'First');
  cache.put(sessionView('third', 'Third'));

  assert.equal(cache.peek('second'), null);
  assert.equal(cache.size, 2);
  assert.throws(
    () =>
      cache.apply('first', {
        kind: 'snapshot',
        view: sessionView('wrong', 'Wrong'),
      }),
    /must match its cache key/u,
  );
});
