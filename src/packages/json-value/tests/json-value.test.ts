import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isJsonBoolean,
  isJsonNumber,
  isJsonRecord,
  isJsonString,
  parseJsonValue,
} from '../index';

test('narrows serialized boundary values without broad escape hatches', () => {
  assert.equal(isJsonRecord({ ready: true }), true);
  assert.equal(isJsonRecord(['ready']), false);
  assert.equal(isJsonString('ready'), true);
  assert.equal(isJsonNumber(1), true);
  assert.equal(isJsonBoolean(false), true);
  assert.deepEqual(parseJsonValue({ nested: ['ready', 1] }), {
    nested: ['ready', 1],
  });
  assert.equal(parseJsonValue(Symbol('invalid')), null);
});
