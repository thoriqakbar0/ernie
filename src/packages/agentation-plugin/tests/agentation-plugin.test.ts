import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  agentationPluginManifest,
  createAgentationPluginModule,
  repairUnsafeAgentationPosition,
} from '@/packages/agentation-plugin';
import { createPluginHost } from '@/packages/plugin-host';

afterEach(() => {
  window.localStorage.clear();
});

test('declares Agentation as an application-wide startup plugin', () => {
  assert.deepEqual(agentationPluginManifest.activationEvents, [
    { event: 'startup' },
  ]);
  assert.deepEqual(agentationPluginManifest.contributes, {
    commands: [],
    views: [],
  });
});

test('owns toolbar setup and cleanup through the plugin host', async () => {
  let prepareCount = 0;
  let mountCount = 0;
  let cleanupCount = 0;
  const created = createPluginHost([
    createAgentationPluginModule({
      prepareToolbar: () => {
        prepareCount += 1;
      },
      mountToolbar: () => {
        mountCount += 1;
        return () => {
          cleanupCount += 1;
        };
      },
    }),
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.deepEqual(await created.value.activateStartupPlugins(), []);
  assert.equal(prepareCount, 1);
  assert.equal(mountCount, 1);
  assert.equal(cleanupCount, 0);

  assert.equal(
    (await created.value.disablePlugin(agentationPluginManifest.id)).ok,
    true,
  );
  assert.equal(cleanupCount, 1);
  assert.equal(
    (await created.value.enablePlugin(agentationPluginManifest.id)).ok,
    true,
  );
  assert.equal(mountCount, 2);
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
