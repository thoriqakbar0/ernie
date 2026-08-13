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
  assert.equal(isJsonNumber(Number.NaN), false);
  assert.equal(isJsonNumber(Number.POSITIVE_INFINITY), false);
  assert.equal(isJsonBoolean(false), true);
  assert.deepEqual(parseJsonValue({ nested: ['ready', 1] }), {
    nested: ['ready', 1],
  });
  for (const invalid of [
    undefined,
    Number.NaN,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Symbol('invalid'),
    { nested: undefined },
    [undefined],
  ]) {
    assert.equal(parseJsonValue(invalid), undefined);
  }
});
