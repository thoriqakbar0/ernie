import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createPluginHost,
  currentPluginApiVersion,
  DuplicatePluginIdError,
  InvalidPluginManifestError,
  parsePluginManifest,
  PluginActivationContextClosedError,
  PluginActivationError,
  PluginCommandExecutionError,
  PluginDeactivationError,
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

function startupManifest(id = 'acme.startup'): PluginManifest {
  return {
    apiVersion: currentPluginApiVersion,
    id,
    name: 'Startup tool',
    version: '1.0.0',
    description: 'Run an application-wide tool.',
    activationEvents: [{ event: 'startup' }],
    contributes: { commands: [], views: [] },
  };
}

function registerTestView(context: PluginActivationContext<string>): void {
  context.registerView(viewId, () => 'Browser view');
}

function serializedTestManifest(
  apiVersion: number = currentPluginApiVersion,
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

test('rejects version two plugins after startup activation is added', () => {
  const result = parsePluginManifest(serializedTestManifest(2));

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.error instanceof InvalidPluginManifestError);
});

test('parses startup activation without a contributed view', () => {
  const result = parsePluginManifest({
    apiVersion: currentPluginApiVersion,
    id: 'acme.startup',
    name: 'Startup tool',
    version: '1.0.0',
    description: 'Run an application-wide tool.',
    activationEvents: [{ event: 'startup' }],
    contributes: { commands: [], views: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.activationEvents, [{ event: 'startup' }]);
  assert.deepEqual(result.value.contributes, { commands: [], views: [] });
});

test('starts enabled plugins once and restarts them after enable', async () => {
  let activationCount = 0;
  let cleanupCount = 0;
  const created = createPluginHost([
    {
      manifest: startupManifest(),
      async activate(context) {
        activationCount += 1;
        await context.acquire(() => ({
          value: undefined,
          cleanup: () => {
            cleanupCount += 1;
          },
        }));
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.deepEqual(await created.value.activateStartupPlugins(), []);
  assert.deepEqual(await created.value.activateStartupPlugins(), []);
  assert.equal(activationCount, 1);

  assert.equal((await created.value.disablePlugin('acme.startup')).ok, true);
  assert.equal(cleanupCount, 1);
  assert.equal((await created.value.enablePlugin('acme.startup')).ok, true);
  assert.equal(activationCount, 2);
});

test('skips disabled startup plugins until the user enables them', async () => {
  let activationCount = 0;
  const created = createPluginHost(
    [
      {
        manifest: startupManifest(),
        activate: () => {
          activationCount += 1;
        },
      },
    ],
    new Set(['acme.startup']),
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.deepEqual(await created.value.activateStartupPlugins(), []);
  assert.equal(activationCount, 0);
  assert.equal((await created.value.enablePlugin('acme.startup')).ok, true);
  assert.equal(activationCount, 1);
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

test('keeps command-handler effects outside activation rollback', async () => {
  let activationCleanupCount = 0;
  let commandEffectCount = 0;
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      async activate(context) {
        await context.acquire(() => ({
          value: undefined,
          cleanup: () => {
            activationCleanupCount += 1;
          },
        }));
        context.registerCommand(commandId, () => {
          commandEffectCount += 1;
          throw new Error('command failed after its effect');
        });
        registerTestView(context);
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const commandResult = await created.value.executeCommand(commandId);
  assert.equal(commandResult.ok, false);
  if (!commandResult.ok) {
    assert.ok(commandResult.error instanceof PluginCommandExecutionError);
  }
  assert.equal(commandEffectCount, 1);
  assert.equal(activationCleanupCount, 0);

  assert.equal((await created.value.disablePlugin('acme.browser')).ok, true);
  assert.equal(activationCleanupCount, 1);
  assert.equal(commandEffectCount, 1);
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

test('rolls back acquired effects in reverse order when later setup fails', async () => {
  const events: string[] = [];
  let commandCount = 0;
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      async activate(context) {
        context.registerCommand(commandId, () => {
          commandCount += 1;
        });
        registerTestView(context);
        await context.acquire(() => ({
          value: 'first',
          cleanup: () => {
            events.push('cleanup first');
          },
        }));
        await context.acquire(() => ({
          value: 'second',
          cleanup: () => {
            events.push('cleanup second');
          },
        }));
        await context.acquire(() => {
          events.push('rollback partial third');
          throw new Error('third setup failed');
        });
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const viewResult = await created.value.renderView(viewId);
  const commandResult = await created.value.executeCommand(commandId);

  assert.equal(viewResult.ok, false);
  if (!viewResult.ok) assert.ok(viewResult.error instanceof PluginActivationError);
  assert.equal(commandResult.ok, false);
  if (!commandResult.ok) {
    assert.ok(commandResult.error instanceof PluginActivationError);
  }
  assert.equal(commandCount, 0);
  assert.deepEqual(events, [
    'rollback partial third',
    'cleanup second',
    'cleanup first',
  ]);
});

test('rejects work through an activation context after activation closes', async () => {
  let retainedContext: PluginActivationContext<string> | undefined;
  let lateSetupCount = 0;
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      activate(context) {
        retainedContext = context;
        context.registerCommand(commandId, () => undefined);
        registerTestView(context);
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal((await created.value.renderView(viewId)).ok, true);
  assert.notEqual(retainedContext, undefined);
  const context = retainedContext;
  if (context === undefined) return;

  assert.throws(
    () => context.registerCommand(commandId, () => undefined),
    PluginActivationContextClosedError,
  );
  await assert.rejects(
    context.acquire(() => {
      lateSetupCount += 1;
      return { value: undefined, cleanup: () => undefined };
    }),
    PluginActivationContextClosedError,
  );
  assert.equal(lateSetupCount, 0);
});

test('closes synchronous activation before queued microtasks can contribute', async () => {
  let lateFailure: unknown;
  let reportLateAttempt = (): void => undefined;
  const lateAttempt = new Promise<void>((resolve) => {
    reportLateAttempt = resolve;
  });
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      activate(context) {
        context.registerCommand(commandId, () => undefined);
        queueMicrotask(() => {
          try {
            registerTestView(context);
          } catch (cause) {
            lateFailure = cause;
          } finally {
            reportLateAttempt();
          }
        });
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const result = await created.value.renderView(viewId);
  await lateAttempt;

  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.error instanceof PluginActivationError);
  assert.ok(lateFailure instanceof PluginActivationContextClosedError);
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

test('drains effects when host disposal interrupts asynchronous activation', async () => {
  let cleanupCount = 0;
  let reportAcquired = (): void => undefined;
  let releaseActivation = (): void => undefined;
  const acquired = new Promise<void>((resolve) => {
    reportAcquired = resolve;
  });
  const activationGate = new Promise<void>((resolve) => {
    releaseActivation = resolve;
  });
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      async activate(context) {
        context.registerCommand(commandId, () => undefined);
        registerTestView(context);
        await context.acquire(() => ({
          value: undefined,
          cleanup: () => {
            cleanupCount += 1;
          },
        }));
        reportAcquired();
        await activationGate;
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const rendering = created.value.renderView(viewId);
  await acquired;
  const disposing = created.value.dispose();
  releaseActivation();

  const renderResult = await rendering;
  assert.equal(renderResult.ok, false);
  if (!renderResult.ok) {
    assert.ok(renderResult.error instanceof PluginHostDisposedError);
  }
  assert.deepEqual(await disposing, []);
  assert.equal(cleanupCount, 1);
});

test('shares repeated host disposal and drains each effect once', async () => {
  let cleanupCount = 0;
  let releaseCleanup = (): void => undefined;
  const cleanupGate = new Promise<void>((resolve) => {
    releaseCleanup = resolve;
  });
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      async activate(context) {
        context.registerCommand(commandId, () => undefined);
        registerTestView(context);
        await context.acquire(() => ({
          value: undefined,
          cleanup: async () => {
            cleanupCount += 1;
            await cleanupGate;
          },
        }));
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal((await created.value.renderView(viewId)).ok, true);

  const firstDisposal = created.value.dispose();
  const secondDisposal = created.value.dispose();
  assert.equal(firstDisposal, secondDisposal);
  releaseCleanup();

  assert.deepEqual(await firstDisposal, []);
  assert.equal(cleanupCount, 1);
  assert.equal(created.value.dispose(), firstDisposal);
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

test('consumes failing cleanup once and permits a fresh activation', async () => {
  const cleanupOrder: string[] = [];
  let activationCount = 0;
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      async activate(context) {
        activationCount += 1;
        context.registerCommand(commandId, () => undefined);
        registerTestView(context);
        await context.acquire(() => ({
          value: 'first',
          cleanup: () => {
            cleanupOrder.push('first');
            if (activationCount === 1) throw new Error('cleanup failed');
          },
        }));
        await context.acquire(() => ({
          value: 'second',
          cleanup: () => {
            cleanupOrder.push('second');
          },
        }));
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.equal((await created.value.renderView(viewId)).ok, true);
  const firstDisable = await created.value.disablePlugin('acme.browser');
  assert.equal(firstDisable.ok, false);
  if (!firstDisable.ok) {
    assert.ok(firstDisable.error instanceof PluginDeactivationError);
    if (firstDisable.error instanceof PluginDeactivationError) {
      assert.equal(firstDisable.error.failures.length, 1);
      assert.equal(firstDisable.error.failures[0]?.sequence, 1);
    }
  }
  assert.equal(created.value.isPluginEnabled('acme.browser'), false);
  assert.deepEqual(cleanupOrder, ['second', 'first']);

  assert.equal((await created.value.disablePlugin('acme.browser')).ok, true);
  assert.deepEqual(cleanupOrder, ['second', 'first']);
  assert.equal((await created.value.enablePlugin('acme.browser')).ok, true);
  assert.equal((await created.value.renderView(viewId)).ok, true);
  assert.equal(activationCount, 2);
});

test('does not retry plugin disposable cleanup', async () => {
  let disposalCount = 0;
  const created = createPluginHost<string>([
    {
      manifest: testManifest(),
      activate(context) {
        context.registerCommand(commandId, () => undefined);
        registerTestView(context);
        return {
          dispose: () => {
            disposalCount += 1;
            throw new Error('cleanup failed');
          },
        };
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.equal((await created.value.renderView(viewId)).ok, true);
  assert.equal((await created.value.disablePlugin('acme.browser')).ok, false);
  assert.equal((await created.value.disablePlugin('acme.browser')).ok, true);
  assert.equal(disposalCount, 1);
});

test('reports activation cleanup failure once when disable interrupts activation', async () => {
  let cleanupCount = 0;
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
        await context.acquire(() => ({
          value: undefined,
          cleanup: () => {
            cleanupCount += 1;
            throw new Error('cleanup failed');
          },
        }));
        await activationGate;
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
  assert.equal(cleanupCount, 1);
  assert.equal((await created.value.disablePlugin('acme.browser')).ok, true);
  assert.equal(cleanupCount, 1);
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
        await context.acquire(() => ({
          value: undefined,
          cleanup: () => {
            disposalCount += 1;
          },
        }));
        if (activationCount === 1) await activationGate;
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
