import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  parseThinkingOrbState,
  readInitialThinkingOrbState,
  storeThinkingOrbState,
} from '@/thinking-orb-preference';

afterEach(() => window.localStorage.clear());

test('restores only supported thinking animation preferences', () => {
  assert.equal(parseThinkingOrbState('connecting'), 'connecting');
  assert.equal(parseThinkingOrbState('sparkling'), null);
  assert.equal(parseThinkingOrbState(null), null);

  window.localStorage.setItem('ernie:thinking-orb-state:v1', 'sparkling');
  assert.equal(readInitialThinkingOrbState(), 'working');

  storeThinkingOrbState('breathing');
  assert.equal(readInitialThinkingOrbState(), 'breathing');
  assert.equal(
    window.localStorage.getItem('ernie:thinking-orb-state:v1'),
    'breathing',
  );
});
