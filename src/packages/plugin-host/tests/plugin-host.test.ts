import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createPluginServiceKey,
  createPluginHost,
  currentPluginApiVersion,
  DuplicatePluginServiceProviderError,
  DuplicatePluginIdError,
  InvalidPluginManifestError,
  MissingPluginServiceProviderError,
  parsePluginManifest,
  PluginActivationContextClosedError,
  PluginActivationError,
  PluginCascadeDeactivationError,
  PluginCommandExecutionError,
  PluginDependencyCycleError,
  PluginDependencyUnavailableError,
  PluginDeactivationError,
  PluginDisabledError,
  PluginHostDisposedError,
  PluginServiceAccessError,
  type PluginActivationContext,
  type PluginHost,
  type PluginManifest,
  type PluginModule,
  type PluginResult,
} from '@/packages/plugin-host';
import type { JsonValue } from '@/packages/json-value';

const viewId = 'acme.browser.main';
const commandId = 'acme.browser.reload';

interface ServiceManifestOptions {
  readonly command?: boolean;
  readonly provides?: readonly string[];
  readonly requires?: readonly string[];
  readonly startup?: boolean;
  readonly view?: boolean;
}

function serviceManifest(
  id: string,
  options: ServiceManifestOptions = {},
): PluginManifest {
  const contributedViewId = `${id}.main`;
  return {
    apiVersion: currentPluginApiVersion,
    id,
    name: id,
    version: '1.0.0',
    description: `${id} test fixture.`,
    provides: options.provides ?? [],
    requires: options.requires ?? [],
    activationEvents: options.startup === true
      ? [{ event: 'startup' }]
      : options.view === true
        ? [{ event: 'view', viewId: contributedViewId }]
        : [],
    contributes: {
      commands:
        options.command === true
          ? [{ id: `${id}.run`, title: `Run ${id}` }]
          : [],
      views:
        options.view === true
          ? [
              {
                id: contributedViewId,
                title: id,
                description: `${id} test view.`,
                icon: 'puzzle',
                location: 'primary',
              },
            ]
          : [],
    },
  };
}

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
    provides: [],
    requires: [],
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
    provides: [],
    requires: [],
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
    provides: [],
    requires: [],
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
  assert.equal(Object.isFrozen(result.value.provides), true);
  assert.equal(Object.isFrozen(result.value.requires), true);
  assert.equal(Object.isFrozen(result.value.contributes.views), true);
});

test('rejects version two plugins after startup and spatial composition changes', () => {
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
    provides: [],
    requires: [],
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

test('activates providers before startup consumers and restores demand', async () => {
  const serviceKey = createPluginServiceKey<Readonly<{ value: string }>>(
    'acme.provider.value',
  );
  const events: string[] = [];
  const created = createPluginHost<string>([
    {
      manifest: serviceManifest('acme.consumer', {
        requires: [serviceKey.id],
        startup: true,
      }),
      activate(context) {
        const service = context.getService(serviceKey);
        events.push(`consumer: ${service.value}`);
      },
    },
    {
      manifest: serviceManifest('acme.provider', {
        provides: [serviceKey.id],
      }),
      activate(context) {
        events.push('provider');
        context.provideService(serviceKey, { value: 'ready' });
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.deepEqual(await created.value.activateStartupPlugins(), []);
  assert.deepEqual(events, ['provider', 'consumer: ready']);
  assert.equal((await created.value.disablePlugin('acme.provider')).ok, true);
  assert.equal((await created.value.enablePlugin('acme.provider')).ok, true);
  assert.deepEqual(events, [
    'provider',
    'consumer: ready',
    'provider',
    'consumer: ready',
  ]);
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

test('rejects invalid service graphs before activation', () => {
  const missingProvider = createPluginHost<string>([
    {
      manifest: serviceManifest('acme.consumer', {
        requires: ['acme.provider.value'],
      }),
      activate: () => undefined,
    },
  ]);
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.ok(missingProvider.error instanceof MissingPluginServiceProviderError);
  }

  const duplicateProvider = createPluginHost<string>([
    {
      manifest: serviceManifest('acme', {
        provides: ['acme.provider.value'],
      }),
      activate: () => undefined,
    },
    {
      manifest: serviceManifest('acme.provider', {
        provides: ['acme.provider.value'],
      }),
      activate: () => undefined,
    },
  ]);
  assert.equal(duplicateProvider.ok, false);
  if (!duplicateProvider.ok) {
    assert.ok(
      duplicateProvider.error instanceof DuplicatePluginServiceProviderError,
    );
  }

  const cycle = createPluginHost<string>([
    {
      manifest: serviceManifest('acme.alpha', {
        provides: ['acme.alpha.value'],
        requires: ['acme.beta.value'],
      }),
      activate: () => undefined,
    },
    {
      manifest: serviceManifest('acme.beta', {
        provides: ['acme.beta.value'],
        requires: ['acme.alpha.value'],
      }),
      activate: () => undefined,
    },
  ]);
  assert.equal(cycle.ok, false);
  if (!cycle.ok) {
    assert.ok(cycle.error instanceof PluginDependencyCycleError);
    if (cycle.error instanceof PluginDependencyCycleError) {
      assert.deepEqual(cycle.error.pluginIds, [
        'acme.alpha',
        'acme.beta',
        'acme.alpha',
      ]);
    }
  }
});

test('activates complete provider chains for views and commands', async () => {
  const sourceKey = createPluginServiceKey<Readonly<{ value: string }>>(
    'acme.source.value',
  );
  const formatterKey = createPluginServiceKey<
    Readonly<{ format(): string }>
  >('acme.formatter.value');

  const createFixture = (
    events: string[],
  ): PluginResult<PluginHost<string>> =>
    createPluginHost<string>([
      {
        manifest: serviceManifest('acme.consumer', {
          command: true,
          requires: [formatterKey.id],
          view: true,
        }),
        activate(context) {
          const formatter = context.getService(formatterKey);
          events.push('consumer');
          context.registerCommand('acme.consumer.run', () => {
            events.push(formatter.format());
          });
          context.registerView('acme.consumer.main', () => formatter.format());
        },
      },
      {
        manifest: serviceManifest('acme.formatter', {
          provides: [formatterKey.id],
          requires: [sourceKey.id],
        }),
        activate(context) {
          const source = context.getService(sourceKey);
          events.push('formatter');
          context.provideService(formatterKey, {
            format: () => `formatted ${source.value}`,
          });
        },
      },
      {
        manifest: serviceManifest('acme.source', {
          provides: [sourceKey.id],
        }),
        activate(context) {
          events.push('source');
          context.provideService(sourceKey, { value: 'evidence' });
        },
      },
    ]);

  const viewEvents: string[] = [];
  const viewHost = createFixture(viewEvents);
  assert.equal(viewHost.ok, true);
  if (!viewHost.ok) return;
  assert.deepEqual(await viewHost.value.renderView('acme.consumer.main'), {
    ok: true,
    value: 'formatted evidence',
  });
  assert.deepEqual(viewEvents, ['source', 'formatter', 'consumer']);

  const commandEvents: string[] = [];
  const commandHost = createFixture(commandEvents);
  assert.equal(commandHost.ok, true);
  if (!commandHost.ok) return;
  assert.equal(
    (await commandHost.value.executeCommand('acme.consumer.run')).ok,
    true,
  );
  assert.deepEqual(commandEvents, [
    'source',
    'formatter',
    'consumer',
    'formatted evidence',
  ]);
});

test('rejects undeclared service publication and consumption transactionally', async () => {
  const serviceKey = createPluginServiceKey<Readonly<{ value: string }>>(
    'acme.provider.value',
  );
  const publicationHost = createPluginHost<string>([
    {
      manifest: serviceManifest('acme.consumer', { command: true, view: true }),
      activate(context) {
        context.provideService(serviceKey, { value: 'ambient' });
        context.registerCommand('acme.consumer.run', () => undefined);
        context.registerView('acme.consumer.main', () => 'unreachable');
      },
    },
  ]);
  assert.equal(publicationHost.ok, true);
  if (!publicationHost.ok) return;
  const publication = await publicationHost.value.renderView(
    'acme.consumer.main',
  );
  assert.equal(publication.ok, false);
  if (!publication.ok) {
    assert.ok(publication.error instanceof PluginActivationError);
    assert.ok(publication.error.cause instanceof PluginServiceAccessError);
  }
  const unpublishedCommand = await publicationHost.value.executeCommand(
    'acme.consumer.run',
  );
  assert.equal(unpublishedCommand.ok, false);
  if (!unpublishedCommand.ok) {
    assert.ok(unpublishedCommand.error instanceof PluginActivationError);
  }

  const consumptionHost = createPluginHost<string>([
    {
      manifest: serviceManifest('acme.consumer', { view: true }),
      activate(context) {
        context.getService(serviceKey);
        context.registerView('acme.consumer.main', () => 'unreachable');
      },
    },
  ]);
  assert.equal(consumptionHost.ok, true);
  if (!consumptionHost.ok) return;
  const consumption = await consumptionHost.value.renderView(
    'acme.consumer.main',
  );
  assert.equal(consumption.ok, false);
  if (!consumption.ok) {
    assert.ok(consumption.error instanceof PluginActivationError);
    assert.ok(consumption.error.cause instanceof PluginServiceAccessError);
  }
});

test('removes staged services after consumer activation failure', async () => {
  const inputKey = createPluginServiceKey<Readonly<{ value: string }>>(
    'acme.provider.input',
  );
  const outputKey = createPluginServiceKey<Readonly<{ value: string }>>(
    'acme.bridge.output',
  );
  let bridgeActivationCount = 0;
  const created = createPluginHost<string>([
    {
      manifest: serviceManifest('acme.provider', {
        provides: [inputKey.id],
      }),
      activate(context) {
        context.provideService(inputKey, { value: 'fresh' });
      },
    },
    {
      manifest: serviceManifest('acme.bridge', {
        provides: [outputKey.id],
        requires: [inputKey.id],
      }),
      activate(context) {
        bridgeActivationCount += 1;
        const input = context.getService(inputKey);
        context.provideService(outputKey, { value: input.value });
        if (bridgeActivationCount === 1) {
          throw new Error('bridge activation failed');
        }
      },
    },
    {
      manifest: serviceManifest('acme.consumer', {
        requires: [outputKey.id],
        view: true,
      }),
      activate(context) {
        const output = context.getService(outputKey);
        context.registerView('acme.consumer.main', () => output.value);
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const failedRender = await created.value.renderView('acme.consumer.main');
  assert.equal(failedRender.ok, false);
  if (!failedRender.ok) {
    assert.ok(failedRender.error instanceof PluginDependencyUnavailableError);
  }
  assert.equal((await created.value.enablePlugin('acme.bridge')).ok, true);
  assert.deepEqual(await created.value.renderView('acme.consumer.main'), {
    ok: true,
    value: 'fresh',
  });
  assert.equal(bridgeActivationCount, 2);
});

test('contains provider activation failure to its dependent plugins', async () => {
  const serviceKey = createPluginServiceKey<Readonly<{ value: string }>>(
    'acme.provider.value',
  );
  const created = createPluginHost<string>([
    {
      manifest: serviceManifest('acme.provider', {
        provides: [serviceKey.id],
      }),
      activate() {
        throw new Error('private provider failure');
      },
    },
    {
      manifest: serviceManifest('acme.consumer', {
        requires: [serviceKey.id],
        view: true,
      }),
      activate(context) {
        context.getService(serviceKey);
        context.registerView('acme.consumer.main', () => 'consumer');
      },
    },
    {
      manifest: serviceManifest('acme.unrelated', { view: true }),
      activate(context) {
        context.registerView('acme.unrelated.main', () => 'unrelated');
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.deepEqual(await created.value.renderView('acme.unrelated.main'), {
    ok: true,
    value: 'unrelated',
  });
  const consumer = await created.value.renderView('acme.consumer.main');
  assert.equal(consumer.ok, false);
  if (!consumer.ok) {
    assert.ok(consumer.error instanceof PluginDependencyUnavailableError);
    if (consumer.error instanceof PluginDependencyUnavailableError) {
      assert.equal(consumer.error.providerFailureTag, 'PluginActivationError');
    }
  }
  assert.deepEqual(
    created.value.listViews().map((view) => view.id),
    ['acme.unrelated.main'],
  );
});

test('keeps provider services readable through dependent cleanup', async () => {
  const serviceKey = createPluginServiceKey<Readonly<{ read(): string }>>(
    'acme.provider.value',
  );
  const events: string[] = [];
  const created = createPluginHost<string>([
    {
      manifest: serviceManifest('acme.provider', {
        provides: [serviceKey.id],
      }),
      async activate(context) {
        await context.acquire(() => ({
          value: undefined,
          cleanup: () => {
            events.push('provider cleanup');
          },
        }));
        context.provideService(serviceKey, { read: () => 'available' });
      },
    },
    {
      manifest: serviceManifest('acme.consumer', {
        requires: [serviceKey.id],
        view: true,
      }),
      async activate(context) {
        context.getService(serviceKey);
        await context.acquire(() => ({
          value: undefined,
          cleanup: () => {
            events.push(`consumer cleanup: ${context.getService(serviceKey).read()}`);
          },
        }));
        context.registerView('acme.consumer.main', () => 'consumer');
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal((await created.value.renderView('acme.consumer.main')).ok, true);

  const disabling = created.value.disablePlugin('acme.provider');
  assert.deepEqual(created.value.listViews(), []);
  assert.equal((await disabling).ok, true);
  assert.deepEqual(events, [
    'consumer cleanup: available',
    'provider cleanup',
  ]);
  assert.equal(created.value.isPluginEnabled('acme.provider'), false);
  assert.equal(created.value.isPluginEnabled('acme.consumer'), true);
  const blockedRender = await created.value.renderView('acme.consumer.main');
  assert.equal(blockedRender.ok, false);
  if (!blockedRender.ok) {
    assert.ok(blockedRender.error instanceof PluginDependencyUnavailableError);
  }
});

test('restores demanded dependents without activating idle consumers', async () => {
  const serviceKey = createPluginServiceKey<Readonly<{ value: string }>>(
    'acme.provider.value',
  );
  let providerActivations = 0;
  let demandedActivations = 0;
  let idleActivations = 0;
  let unrelatedActivations = 0;
  let unrelatedCleanups = 0;
  const created = createPluginHost<string>([
    {
      manifest: serviceManifest('acme.provider', {
        provides: [serviceKey.id],
      }),
      activate(context) {
        providerActivations += 1;
        context.provideService(serviceKey, { value: 'ready' });
      },
    },
    {
      manifest: serviceManifest('acme.demanded', {
        requires: [serviceKey.id],
        view: true,
      }),
      activate(context) {
        demandedActivations += 1;
        const service = context.getService(serviceKey);
        context.registerView('acme.demanded.main', () => service.value);
      },
    },
    {
      manifest: serviceManifest('acme.idle', {
        requires: [serviceKey.id],
        view: true,
      }),
      activate(context) {
        idleActivations += 1;
        const service = context.getService(serviceKey);
        context.registerView('acme.idle.main', () => service.value);
      },
    },
    {
      manifest: serviceManifest('acme.unrelated', { view: true }),
      activate(context) {
        unrelatedActivations += 1;
        context.registerView('acme.unrelated.main', () => 'unrelated');
        return {
          dispose: () => {
            unrelatedCleanups += 1;
          },
        };
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.equal((await created.value.renderView('acme.demanded.main')).ok, true);
  assert.equal((await created.value.renderView('acme.unrelated.main')).ok, true);
  assert.equal((await created.value.disablePlugin('acme.provider')).ok, true);
  assert.deepEqual(
    created.value.listViews().map((view) => view.id),
    ['acme.unrelated.main'],
  );
  assert.equal((await created.value.enablePlugin('acme.provider')).ok, true);
  assert.deepEqual(
    created.value.listViews().map((view) => view.id),
    ['acme.demanded.main', 'acme.idle.main', 'acme.unrelated.main'],
  );
  assert.equal(providerActivations, 2);
  assert.equal(demandedActivations, 2);
  assert.equal(idleActivations, 0);
  assert.equal(unrelatedActivations, 1);
  assert.equal(unrelatedCleanups, 0);

  assert.equal((await created.value.renderView('acme.idle.main')).ok, true);
  const firstDisable = created.value.disablePlugin('acme.provider');
  const repeatedDisable = created.value.disablePlugin('acme.provider');
  assert.equal((await firstDisable).ok, true);
  assert.equal((await repeatedDisable).ok, true);
  assert.equal((await created.value.enablePlugin('acme.provider')).ok, true);
  assert.equal((await created.value.enablePlugin('acme.provider')).ok, true);
  assert.equal(providerActivations, 3);
  assert.equal(demandedActivations, 3);
  assert.equal(idleActivations, 2);
  assert.equal(unrelatedActivations, 1);
  assert.equal(unrelatedCleanups, 0);

  const firstDisposal = created.value.dispose();
  assert.equal(created.value.dispose(), firstDisposal);
  assert.deepEqual(await firstDisposal, []);
  assert.equal(unrelatedCleanups, 1);
});

test('deduplicates concurrent activation across a dependency graph', async () => {
  const serviceKey = createPluginServiceKey<Readonly<{ value: string }>>(
    'acme.provider.value',
  );
  let providerActivations = 0;
  let consumerActivations = 0;
  let commandExecutions = 0;
  let releaseProvider = (): void => undefined;
  const providerGate = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  const created = createPluginHost<string>([
    {
      manifest: serviceManifest('acme.provider', {
        provides: [serviceKey.id],
      }),
      async activate(context) {
        providerActivations += 1;
        await providerGate;
        context.provideService(serviceKey, { value: 'ready' });
      },
    },
    {
      manifest: serviceManifest('acme.consumer', {
        command: true,
        requires: [serviceKey.id],
        view: true,
      }),
      activate(context) {
        consumerActivations += 1;
        const service = context.getService(serviceKey);
        context.registerCommand('acme.consumer.run', () => {
          commandExecutions += 1;
        });
        context.registerView('acme.consumer.main', () => service.value);
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const rendering = created.value.renderView('acme.consumer.main');
  const executing = created.value.executeCommand('acme.consumer.run');
  releaseProvider();
  const [renderResult, commandResult] = await Promise.all([
    rendering,
    executing,
  ]);
  assert.equal(renderResult.ok, true);
  assert.equal(commandResult.ok, true);
  assert.equal(providerActivations, 1);
  assert.equal(consumerActivations, 1);
  assert.equal(commandExecutions, 1);
});

test('converges when a provider is disabled during activation', async () => {
  const serviceKey = createPluginServiceKey<Readonly<{ value: string }>>(
    'acme.provider.value',
  );
  let providerActivations = 0;
  let consumerActivations = 0;
  let providerCleanups = 0;
  let releaseProvider = (): void => undefined;
  const providerGate = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  const created = createPluginHost<string>([
    {
      manifest: serviceManifest('acme.provider', {
        provides: [serviceKey.id],
      }),
      async activate(context) {
        providerActivations += 1;
        await context.acquire(() => ({
          value: undefined,
          cleanup: () => {
            providerCleanups += 1;
          },
        }));
        if (providerActivations === 1) await providerGate;
        context.provideService(serviceKey, { value: 'ready' });
      },
    },
    {
      manifest: serviceManifest('acme.consumer', {
        requires: [serviceKey.id],
        view: true,
      }),
      activate(context) {
        consumerActivations += 1;
        const service = context.getService(serviceKey);
        context.registerView('acme.consumer.main', () => service.value);
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const rendering = created.value.renderView('acme.consumer.main');
  const disabling = created.value.disablePlugin('acme.provider');
  releaseProvider();
  const renderResult = await rendering;
  assert.equal(renderResult.ok, false);
  if (!renderResult.ok) {
    assert.ok(renderResult.error instanceof PluginDependencyUnavailableError);
  }
  assert.equal((await disabling).ok, true);
  assert.equal(providerCleanups, 1);
  assert.equal(consumerActivations, 0);
  assert.deepEqual(created.value.listViews(), []);

  assert.equal((await created.value.enablePlugin('acme.provider')).ok, true);
  assert.deepEqual(await created.value.renderView('acme.consumer.main'), {
    ok: true,
    value: 'ready',
  });
  assert.equal(providerActivations, 2);
  assert.equal(consumerActivations, 1);
});

test('continues dependency cleanup after an isolated failure', async () => {
  const serviceKey = createPluginServiceKey<Readonly<{ value: string }>>(
    'acme.provider.value',
  );
  const events: string[] = [];
  const created = createPluginHost<string>([
    {
      manifest: serviceManifest('acme.consumer-a', {
        requires: [serviceKey.id],
        view: true,
      }),
      async activate(context) {
        context.getService(serviceKey);
        await context.acquire(() => ({
          value: undefined,
          cleanup: () => {
            events.push('consumer a cleanup');
            throw new Error('consumer a cleanup failed');
          },
        }));
        context.registerView('acme.consumer-a.main', () => 'consumer a');
      },
    },
    {
      manifest: serviceManifest('acme.provider', {
        provides: [serviceKey.id],
      }),
      async activate(context) {
        await context.acquire(() => ({
          value: undefined,
          cleanup: () => {
            events.push('provider cleanup');
          },
        }));
        context.provideService(serviceKey, { value: 'ready' });
      },
    },
    {
      manifest: serviceManifest('acme.consumer-b', {
        requires: [serviceKey.id],
        view: true,
      }),
      async activate(context) {
        context.getService(serviceKey);
        await context.acquire(() => ({
          value: undefined,
          cleanup: () => {
            events.push('consumer b cleanup');
          },
        }));
        context.registerView('acme.consumer-b.main', () => 'consumer b');
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal((await created.value.renderView('acme.consumer-a.main')).ok, true);
  assert.equal((await created.value.renderView('acme.consumer-b.main')).ok, true);

  const result = await created.value.disablePlugin('acme.provider');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error instanceof PluginCascadeDeactivationError);
    if (result.error instanceof PluginCascadeDeactivationError) {
      assert.deepEqual(
        result.error.failures.map((failure) => failure.pluginId),
        ['acme.consumer-a'],
      );
    }
  }
  assert.deepEqual(events, [
    'consumer b cleanup',
    'consumer a cleanup',
    'provider cleanup',
  ]);
});

test('disposes consumers before providers regardless of registration order', async () => {
  const serviceKey = createPluginServiceKey<Readonly<{ value: string }>>(
    'acme.provider.value',
  );
  const events: string[] = [];
  const created = createPluginHost<string>([
    {
      manifest: serviceManifest('acme.consumer', {
        requires: [serviceKey.id],
        view: true,
      }),
      activate(context) {
        context.getService(serviceKey);
        context.registerView('acme.consumer.main', () => 'consumer');
        return {
          dispose: () => {
            events.push('consumer cleanup');
          },
        };
      },
    },
    {
      manifest: serviceManifest('acme.provider', {
        provides: [serviceKey.id],
      }),
      activate(context) {
        context.provideService(serviceKey, { value: 'ready' });
        return {
          dispose: () => {
            events.push('provider cleanup');
          },
        };
      },
    },
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal((await created.value.renderView('acme.consumer.main')).ok, true);

  assert.deepEqual(await created.value.dispose(), []);
  assert.deepEqual(events, ['consumer cleanup', 'provider cleanup']);
});
