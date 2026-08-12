import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { repairUnsafeAgentationPosition } from '@/components/renderer-app';

afterEach(() => {
  window.localStorage.clear();
});

test('moves an Agentation position outside the desktop sidebar', () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1360,
  });
  window.localStorage.setItem('ernie:sidebar-width:v1', '280');
  window.localStorage.setItem(
    'feedback-toolbar-position',
    JSON.stringify({ x: 20, y: 80 }),
  );

  repairUnsafeAgentationPosition();

  assert.deepEqual(
    JSON.parse(
      window.localStorage.getItem('feedback-toolbar-position') ?? 'null',
    ),
    { x: 1003, y: 64 },
  );
});

test('gives a new desktop Agentation toolbar a safe position', () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1360,
  });

  repairUnsafeAgentationPosition();

  assert.deepEqual(
    JSON.parse(
      window.localStorage.getItem('feedback-toolbar-position') ?? 'null',
    ),
    { x: 1003, y: 64 },
  );
});

test('keeps an Agentation position inside the desktop content area', () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1360,
  });
  const position = JSON.stringify({ x: 400, y: 80 });
  window.localStorage.setItem('feedback-toolbar-position', position);

  repairUnsafeAgentationPosition();

  assert.equal(
    window.localStorage.getItem('feedback-toolbar-position'),
    position,
  );
});
