import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sessionNameFromFirstMessage } from '../index';

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
