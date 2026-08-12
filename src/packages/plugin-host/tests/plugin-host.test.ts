import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createPluginHost,
  currentPluginApiVersion,
  DuplicatePluginIdError,
  InvalidPluginManifestError,
  parsePluginManifest,
  PluginActivationError,
  PluginCommandExecutionError,
  PluginHostDisposedError,
  type PluginManifest,
  type PluginModule,
} from '@/packages/plugin-host';
import type { JsonValue } from '@/packages/json-value';

const viewId = 'acme.browser.main';
const commandId = 'acme.browser.reload';

function testManifest(id = 'acme.browser'): PluginManifest {
  return {
    apiVersion: currentPluginApiVersion,
    id,
    name: 'Browser',
    version: '1.0.0',
    description: 'Browse the web.',
    activationEvents: [{ event: 'view', viewId }],
    contributes: {
      commands: [{ id: commandId, title: 'Reload browser' }],
      views: [
        {
          id: viewId,
          title: 'Browser',
          description: 'Browse the web.',
          icon: 'globe',
          location: 'primary',
        },
      ],
    },
  };
}

function serializedTestManifest(apiVersion = 1): JsonValue {
  return {
    apiVersion,
    id: 'acme.browser',
    name: 'Browser',
    version: '1.0.0',
    description: 'Browse the web.',
    activationEvents: [{ event: 'view', viewId }],
    contributes: {
      commands: [{ id: commandId, title: 'Reload browser' }],
      views: [
        {
          id: viewId,
          title: 'Browser',
          description: 'Browse the web.',
          icon: 'globe',
          location: 'primary',
        },
      ],
    },
  };
}

test('parses a serialized plugin manifest into immutable metadata', () => {
  const result = parsePluginManifest(serializedTestManifest());

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.id, 'acme.browser');
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.contributes.views), true);
});

test('rejects unsupported API versions at the manifest boundary', () => {
  const result = parsePluginManifest(serializedTestManifest(2));

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.error instanceof InvalidPluginManifestError);
});

test('rejects duplicate plugin ids before activation', () => {
  const module: PluginModule = {
    manifest: testManifest(),
    activate: () => undefined,
  };
  const result = createPluginHost([module, module]);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.error instanceof DuplicatePluginIdError);
});

test('activates once under concurrent view and command requests', async () => {
  let activationCount = 0;
  let commandCount = 0;
  let releaseActivation = (): void => undefined;
  const activationGate = new Promise<void>((resolve) => {
    releaseActivation = resolve;
  });
  const module: PluginModule = {
    manifest: testManifest(),
    async activate(context) {
      activationCount += 1;
      context.registerCommand(commandId, () => {
        commandCount += 1;
      });
      await activationGate;
    },
  };
  const created = createPluginHost([module]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const viewActivation = created.value.activateView(viewId);
  const commandExecution = created.value.executeCommand(commandId);
  releaseActivation();

  const [viewResult, commandResult] = await Promise.all([
    viewActivation,
    commandExecution,
  ]);
  assert.equal(viewResult.ok, true);
  assert.equal(commandResult.ok, true);
  assert.equal(activationCount, 1);
  assert.equal(commandCount, 1);
});

test('isolates activation and command defects as typed failures', async () => {
  const activationFailure = createPluginHost([
    {
      manifest: testManifest(),
      activate: () => {
        throw new Error('secret activation detail');
      },
    },
  ]);
  assert.equal(activationFailure.ok, true);
  if (!activationFailure.ok) return;
  const activationResult = await activationFailure.value.activateView(viewId);
  assert.equal(activationResult.ok, false);
  if (!activationResult.ok) {
    assert.ok(activationResult.error instanceof PluginActivationError);
    assert.doesNotMatch(activationResult.error.message, /secret/u);
  }

  const commandFailure = createPluginHost([
    {
      manifest: testManifest(),
      activate: (context) => {
        context.registerCommand(commandId, () => {
          throw new Error('secret command detail');
        });
      },
    },
  ]);
  assert.equal(commandFailure.ok, true);
  if (!commandFailure.ok) return;
  const commandResult = await commandFailure.value.executeCommand(commandId);
  assert.equal(commandResult.ok, false);
  if (!commandResult.ok) {
    assert.ok(commandResult.error instanceof PluginCommandExecutionError);
    assert.doesNotMatch(commandResult.error.message, /secret/u);
  }
});

test('disposes active plugins and closes the host', async () => {
  let disposed = false;
  const created = createPluginHost([
    {
      manifest: testManifest(),
      activate: (context) => {
        context.registerCommand(commandId, () => undefined);
        return {
          dispose: () => {
            disposed = true;
          },
        };
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.equal((await created.value.activateView(viewId)).ok, true);
  assert.deepEqual(await created.value.dispose(), []);
  assert.equal(disposed, true);
  const commandResult = await created.value.executeCommand(commandId);
  assert.equal(commandResult.ok, false);
  if (!commandResult.ok) {
    assert.ok(commandResult.error instanceof PluginHostDisposedError);
  }
});
