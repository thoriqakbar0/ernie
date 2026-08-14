import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  repairUnsafeAgentationPosition,
  watchColorThemeRequests,
  watchSidebarControlRequests,
} from '@/components/renderer-app';
import type { ErnieRendererApi } from '@/renderer-api';

afterEach(() => {
  window.localStorage.clear();
});

test('applies only supported UI-control color themes', () => {
  let themeListener: Parameters<
    ErnieRendererApi['onColorThemeRequest']
  >[0] = () => undefined;
  let cleanupCount = 0;
  const selectedThemes: string[] = [];

  const stop = watchColorThemeRequests(
    {
      onColorThemeRequest: (listener) => {
        themeListener = listener;
        return () => {
          cleanupCount += 1;
        };
      },
    },
    (theme) => selectedThemes.push(theme),
  );

  themeListener('dark');
  themeListener('system');
  themeListener({ theme: 'light' });
  themeListener('light');
  stop();

  assert.deepEqual(selectedThemes, ['dark', 'light']);
  assert.equal(cleanupCount, 1);
});

test('applies only supported UI-control sidebar requests', () => {
  let sidebarListener: Parameters<
    ErnieRendererApi['onSidebarControlRequest']
  >[0] = () => undefined;
  let cleanupCount = 0;
  const selectedRequests: unknown[] = [];

  const stop = watchSidebarControlRequests(
    {
      onSidebarControlRequest: (listener) => {
        sidebarListener = listener;
        return () => {
          cleanupCount += 1;
        };
      },
    },
    (request) => selectedRequests.push(request),
  );

  sidebarListener({ open: false, type: 'set-sidebar-open' });
  sidebarListener({ type: 'set-sidebar-width', width: 320 });
  sidebarListener({ type: 'set-sidebar-width', width: 191 });
  sidebarListener({ type: 'set-sidebar-width', width: 320.5 });
  sidebarListener({ open: 'true', type: 'set-sidebar-open' });
  stop();

  assert.deepEqual(selectedRequests, [
    { open: false, type: 'set-sidebar-open' },
    { type: 'set-sidebar-width', width: 320 },
  ]);
  assert.equal(cleanupCount, 1);
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
