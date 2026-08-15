import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
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
