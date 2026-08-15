import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPluginHost } from '@/packages/plugin-host';
import {
  createReactGrabPluginModule,
  reactGrabPluginManifest,
} from '@/packages/react-grab-plugin';

test('declares React Grab as an application-wide startup plugin', () => {
  assert.deepEqual(reactGrabPluginManifest.activationEvents, [
    { event: 'startup' },
  ]);
  assert.deepEqual(reactGrabPluginManifest.contributes, {
    commands: [],
    views: [],
  });
});

test('loads and disposes React Grab through the plugin lifecycle', async () => {
  let enabled = false;
  let loadCount = 0;
  let disposalCount = 0;
  const created = createPluginHost([
    createReactGrabPluginModule({
      load: async () => {
        loadCount += 1;
        return {
          dispose: () => {
            disposalCount += 1;
            enabled = false;
          },
          isEnabled: () => enabled,
          setEnabled: (nextEnabled) => {
            enabled = nextEnabled;
          },
        };
      },
    }),
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.deepEqual(await created.value.activateStartupPlugins(), []);
  assert.equal(loadCount, 1);
  assert.equal(enabled, true);

  assert.equal(
    (await created.value.disablePlugin(reactGrabPluginManifest.id)).ok,
    true,
  );
  assert.equal(disposalCount, 1);
  assert.equal(enabled, false);
  assert.equal(
    (await created.value.enablePlugin(reactGrabPluginManifest.id)).ok,
    true,
  );
  assert.equal(loadCount, 2);
  assert.equal(enabled, true);
});
