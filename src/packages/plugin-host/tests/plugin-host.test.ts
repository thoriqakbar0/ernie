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
  PluginDisabledError,
  PluginHostDisposedError,
  type PluginActivationContext,
  type PluginManifest,
  type PluginModule,
  type PluginResult,
} from '@/packages/plugin-host';
import type { JsonValue } from '@/packages/json-value';

const viewId = 'acme.browser.main';
const commandId = 'acme.browser.reload';

function testManifest(
  id = 'acme.browser',
  contributedViewId = viewId,
  contributedCommandId = commandId,
): PluginManifest {
  return {
    apiVersion: currentPluginApiVersion,
    id,
    name: 'Browser',
    version: '1.0.0',
    description: 'Browse the web.',
    activationEvents: [{ event: 'view', viewId: contributedViewId }],
    contributes: {
      commands: [{ id: contributedCommandId, title: 'Reload browser' }],
      views: [
        {
          id: contributedViewId,
          title: 'Browser',
          description: 'Browse the web.',
          icon: 'globe',
          location: 'primary',
        },
      ],
    },
  };
}

function registerTestView(context: PluginActivationContext<string>): void {
  context.registerView(viewId, () => 'Browser view');
}

function serializedTestManifest(
  apiVersion = 1,
  location: 'agent' | 'primary' = 'primary',
): JsonValue {
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
          location,
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

test('parses Agent views without exposing them as primary navigation', () => {
  const result = parsePluginManifest(serializedTestManifest(1, 'agent'));

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.contributes.views[0]?.location, 'agent');
});

test('rejects unsupported API versions at the manifest boundary', () => {
  const result = parsePluginManifest(serializedTestManifest(2));

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.error instanceof InvalidPluginManifestError);
});

test('rejects duplicate plugin ids before activation', () => {
  const module: PluginModule<string> = {
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
  const module: PluginModule<string> = {
    manifest: testManifest(),
    async activate(context) {
      activationCount += 1;
      context.registerCommand(commandId, () => {
        commandCount += 1;
      });
      registerTestView(context);
      await activationGate;
    },
  };
  const created = createPluginHost([module]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const viewActivation = created.value.renderView(viewId);
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
  const activationResult = await activationFailure.value.renderView(viewId);
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
        registerTestView(context);
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

test('rolls back resources when activation omits a declared contribution', async () => {
  let disposalCount = 0;
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      activate: (context) => {
        context.registerCommand(commandId, () => undefined);
        return {
          dispose: () => {
            disposalCount += 1;
          },
        };
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const result = await created.value.renderView(viewId);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.error instanceof PluginActivationError);
  assert.equal(disposalCount, 1);
});

test('disposes active plugins and closes the host', async () => {
  let disposed = false;
  const created = createPluginHost([
    {
      manifest: testManifest(),
      activate: (context) => {
        context.registerCommand(commandId, () => undefined);
        registerTestView(context);
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

  assert.equal((await created.value.renderView(viewId)).ok, true);
  assert.deepEqual(await created.value.dispose(), []);
  assert.equal(disposed, true);
  const commandResult = await created.value.executeCommand(commandId);
  assert.equal(commandResult.ok, false);
  if (!commandResult.ok) {
    assert.ok(commandResult.error instanceof PluginHostDisposedError);
  }
});

test('removes plugin UI and commands until the user restores them', async () => {
  let activationCount = 0;
  let disposalCount = 0;
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      activate: (context) => {
        activationCount += 1;
        context.registerCommand(commandId, () => undefined);
        registerTestView(context);
        return {
          dispose: () => {
            disposalCount += 1;
          },
        };
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const firstView = await created.value.renderView(viewId);
  assert.deepEqual(firstView, { ok: true, value: 'Browser view' });
  assert.equal((await created.value.disablePlugin('acme.browser')).ok, true);
  assert.deepEqual(created.value.listViews(), []);
  const disabledCommand = await created.value.executeCommand(commandId);
  assert.equal(disabledCommand.ok, false);
  if (!disabledCommand.ok) {
    assert.ok(disabledCommand.error instanceof PluginDisabledError);
  }

  assert.equal((await created.value.enablePlugin('acme.browser')).ok, true);
  assert.equal(created.value.listViews()[0]?.id, viewId);
  assert.equal((await created.value.renderView(viewId)).ok, true);
  assert.equal(activationCount, 2);
  assert.equal(disposalCount, 1);
});

test('limits a contributed view to its owning plugin commands', async () => {
  const otherPluginId = 'acme.other';
  const otherViewId = 'acme.other.main';
  const otherCommandId = 'acme.other.run';
  let otherCommandCount = 0;
  let crossPluginResult: Promise<PluginResult<void>> | undefined;
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      activate: (context) => {
        context.registerCommand(commandId, () => undefined);
        context.registerView(viewId, (viewContext) => {
          crossPluginResult = viewContext.executeCommand(otherCommandId);
          return 'Browser view';
        });
      },
    },
    {
      manifest: testManifest(otherPluginId, otherViewId, otherCommandId),
      activate: (context) => {
        context.registerCommand(otherCommandId, () => {
          otherCommandCount += 1;
        });
        context.registerView(otherViewId, () => 'Other view');
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.equal((await created.value.renderView(viewId)).ok, true);
  assert.notEqual(crossPluginResult, undefined);
  if (crossPluginResult === undefined) return;
  assert.equal((await crossPluginResult).ok, false);
  assert.equal(otherCommandCount, 0);
});

test('keeps a plugin disabled until failed cleanup succeeds', async () => {
  let cleanupShouldFail = true;
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      activate: (context) => {
        context.registerCommand(commandId, () => undefined);
        registerTestView(context);
        return {
          dispose: () => {
            if (cleanupShouldFail) throw new Error('cleanup failed');
          },
        };
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.equal((await created.value.renderView(viewId)).ok, true);
  assert.equal((await created.value.disablePlugin('acme.browser')).ok, false);
  assert.equal(created.value.isPluginEnabled('acme.browser'), false);
  assert.equal((await created.value.enablePlugin('acme.browser')).ok, false);

  cleanupShouldFail = false;
  assert.equal((await created.value.disablePlugin('acme.browser')).ok, true);
  assert.equal((await created.value.enablePlugin('acme.browser')).ok, true);
  assert.equal((await created.value.renderView(viewId)).ok, true);
});

test('keeps a plugin disabled when cleanup fails during activation', async () => {
  let cleanupShouldFail = true;
  let releaseActivation = (): void => undefined;
  const activationGate = new Promise<void>((resolve) => {
    releaseActivation = resolve;
  });
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      async activate(context) {
        context.registerCommand(commandId, () => undefined);
        registerTestView(context);
        await activationGate;
        return {
          dispose: () => {
            if (cleanupShouldFail) throw new Error('cleanup failed');
          },
        };
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const viewRendering = created.value.renderView(viewId);
  const disabling = created.value.disablePlugin('acme.browser');
  releaseActivation();

  assert.equal((await viewRendering).ok, false);
  assert.equal((await disabling).ok, false);
  assert.equal((await created.value.enablePlugin('acme.browser')).ok, false);

  cleanupShouldFail = false;
  assert.equal((await created.value.disablePlugin('acme.browser')).ok, true);
  assert.equal((await created.value.enablePlugin('acme.browser')).ok, true);
});

test('waits for in-flight cleanup before restoring a plugin', async () => {
  let releaseCleanup = (): void => undefined;
  const cleanupGate = new Promise<void>((resolve) => {
    releaseCleanup = resolve;
  });
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      activate: (context) => {
        context.registerCommand(commandId, () => undefined);
        registerTestView(context);
        return { dispose: () => cleanupGate };
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.equal((await created.value.renderView(viewId)).ok, true);
  const disabling = created.value.disablePlugin('acme.browser');
  const restoring = created.value.enablePlugin('acme.browser');
  assert.equal(created.value.isPluginEnabled('acme.browser'), false);

  releaseCleanup();
  assert.equal((await disabling).ok, true);
  assert.equal((await restoring).ok, true);
  assert.equal(created.value.isPluginEnabled('acme.browser'), true);
  assert.equal((await created.value.renderView(viewId)).ok, true);
});

test('waits for activation cleanup before restoring a plugin', async () => {
  let activationCount = 0;
  let disposalCount = 0;
  let releaseActivation = (): void => undefined;
  const activationGate = new Promise<void>((resolve) => {
    releaseActivation = resolve;
  });
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      async activate(context) {
        activationCount += 1;
        context.registerCommand(commandId, () => undefined);
        registerTestView(context);
        if (activationCount === 1) await activationGate;
        return {
          dispose: () => {
            disposalCount += 1;
          },
        };
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const viewRendering = created.value.renderView(viewId);
  const disabling = created.value.disablePlugin('acme.browser');
  const restoring = created.value.enablePlugin('acme.browser');
  assert.equal(created.value.isPluginEnabled('acme.browser'), false);

  releaseActivation();
  assert.equal((await viewRendering).ok, false);
  assert.equal((await disabling).ok, true);
  assert.equal((await restoring).ok, true);
  assert.equal(created.value.isPluginEnabled('acme.browser'), true);
  assert.equal((await created.value.renderView(viewId)).ok, true);
  assert.equal(activationCount, 2);
  assert.equal(disposalCount, 1);
});
