import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createRenameSessionTool,
  renameSessionFromAgentSuggestion,
  sessionNameFromAgentSuggestion,
  sessionNameFromFirstMessage,
} from '../index';

test('uses the normalized first message as the session name', () => {
  assert.equal(
    sessionNameFromFirstMessage('  build   the\ncalm sidebar  '),
    'Build the calm sidebar',
  );
});

test('turns a verbose request into a short session title', () => {
  assert.equal(
    sessionNameFromFirstMessage('Please rate this codebase from 1-10.'),
    'Rate this codebase',
  );
  assert.equal(
    sessionNameFromFirstMessage(
      'Can you inspect the renderer and improve the empty chat experience today?',
    ),
    'Inspect the renderer and improve the empty…',
  );
});

test('ignores an empty first message', () => {
  assert.equal(sessionNameFromFirstMessage(' \n\t '), null);
});

test('keeps generated session names compact', () => {
  const name = sessionNameFromFirstMessage('a'.repeat(100));

  assert.equal(name, `${'A'}${'a'.repeat(46)}…`);
  assert.equal(name?.length, 48);
});

test('normalizes agent-proposed session names', () => {
  assert.equal(
    sessionNameFromAgentSuggestion('  investigate   cache\ninvalidation  '),
    'Investigate cache invalidation',
  );

  const name = sessionNameFromAgentSuggestion('a'.repeat(100));
  assert.equal(name, `${'A'}${'a'.repeat(46)}…`);
  assert.equal(name?.length, 48);
  assert.equal(sessionNameFromAgentSuggestion(' \n\t '), null);
});

test('lets the agent rename its current session through a scoped tool', async () => {
  const renamedSessions: string[] = [];
  const tool = createRenameSessionTool((name) => {
    renamedSessions.push(name);
  });

  const result = await tool.execute('rename-1', {
    name: '  investigate   cache invalidation  ',
  });

  assert.equal(tool.name, 'rename_session');
  assert.equal(Object.hasOwn(tool, 'promptGuidelines'), false);
  assert.deepEqual(renamedSessions, ['Investigate cache invalidation']);
  assert.deepEqual(result, {
    content: [
      {
        text: 'Session renamed to "Investigate cache invalidation".',
        type: 'text',
      },
    ],
    details: { name: 'Investigate cache invalidation', renamed: true },
  });
});

test('does not persist an empty agent-proposed session name', async () => {
  const renamedSessions: string[] = [];
  const result = await renameSessionFromAgentSuggestion(
    (name) => {
      renamedSessions.push(name);
    },
    ' \n\t ',
  );

  assert.deepEqual(renamedSessions, []);
  assert.deepEqual(result, {
    content: [
      {
        text: 'The session name must contain a visible character.',
        type: 'text',
      },
    ],
    details: { name: null, renamed: false },
  });
});
