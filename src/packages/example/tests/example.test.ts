import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatGreeting } from '../index';

test('formats a greeting through the package entry point', () => {
  assert.equal(formatGreeting('Ernie'), 'Hello, Ernie.');
});
