import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sessionNameFromFirstMessage } from '../index';

test('uses the normalized first message as the session name', () => {
  assert.equal(
    sessionNameFromFirstMessage('  build   the\ncalm sidebar  '),
    'build the calm sidebar',
  );
});

test('ignores an empty first message', () => {
  assert.equal(sessionNameFromFirstMessage(' \n\t '), null);
});

test('keeps generated session names compact', () => {
  const name = sessionNameFromFirstMessage('a'.repeat(100));

  assert.equal(name, `${'a'.repeat(71)}…`);
  assert.equal(name?.length, 72);
});
