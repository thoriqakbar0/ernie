import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  browserPluginBackCommand,
  browserPluginManifest,
  browserPluginViewId,
  createBrowserPluginLeaseRegistry,
  parseBrowserPluginAcknowledgement,
  parseBrowserPluginLeaseResult,
  parseBrowserPluginResult,
  resolveBrowserAddress,
  type BrowserPluginRendererApi,
} from '@/packages/browser-plugin';
import { createBrowserPluginModule } from '@/packages/browser-plugin/view';
import {
  createPluginHost,
  PluginActivationError,
  PluginDeactivationError,
} from '@/packages/plugin-host';

const state = {
  url: 'https://example.com/',
  title: 'Example Domain',
  loading: false,
  canGoBack: false,
  canGoForward: false,
};

function successfulState() {
  return { ok: true, state } as const;
}

function testRenderer(
  backCalls: string[],
  lifecycle: string[] = [],
): BrowserPluginRendererApi {
  return {
    acquireBrowserPlugin: async () => {
      lifecycle.push('acquire');
      return { ok: true, lease: { id: 'test-browser-lease' } };
    },
    releaseBrowserPlugin: async (lease) => {
      lifecycle.push(`release:${lease.id}`);
      return { ok: true };
    },
    showBrowserPlugin: async () => successfulState(),
    hideBrowserPlugin: async () => successfulState(),
    navigateBrowserPlugin: async () => successfulState(),
    goBackBrowserPlugin: async () => {
      backCalls.push('back');
      return successfulState();
    },
    goForwardBrowserPlugin: async () => successfulState(),
    reloadBrowserPlugin: async () => successfulState(),
    onBrowserPluginState: () => () => undefined,
  };
}

test('resolves domains, localhost, and search terms at the plugin boundary', () => {
  assert.deepEqual(resolveBrowserAddress('example.com/docs'), {
    ok: true,
    value: 'https://example.com/docs',
  });
  assert.deepEqual(resolveBrowserAddress('localhost:5173'), {
    ok: true,
    value: 'http://localhost:5173/',
  });
  assert.deepEqual(resolveBrowserAddress('ernie plugin ecosystem'), {
    ok: true,
    value: 'https://www.google.com/search?q=ernie%20plugin%20ecosystem',
  });
  assert.equal(resolveBrowserAddress('file:///tmp/private').ok, false);
});

test('parses safe Browser responses and rejects malformed responses', () => {
  const parsed = parseBrowserPluginResult(successfulState());
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value, state);
  assert.equal(parseBrowserPluginResult({ ok: true }).ok, false);
  assert.deepEqual(
    parseBrowserPluginLeaseResult({
      ok: true,
      lease: { id: 'test-browser-lease' },
    }),
    { ok: true, value: { id: 'test-browser-lease' } },
  );
  assert.equal(parseBrowserPluginLeaseResult({ ok: true }).ok, false);
  assert.deepEqual(parseBrowserPluginAcknowledgement({ ok: true }), {
    ok: true,
    value: undefined,
  });
  assert.equal(parseBrowserPluginAcknowledgement({ ok: 'yes' }).ok, false);
});

test('releases Browser activation leases once across replacement and renderer loss', () => {
  const released: string[] = [];
  const leases = createBrowserPluginLeaseRegistry((lease) => {
    released.push(lease.id);
  });

  const first = leases.acquire(7);
  const second = leases.acquire(7);
  assert.deepEqual(released, [first.id]);
  assert.equal(leases.isOwnedBy(7), true);

  leases.release(7, first);
  leases.releaseOwner(8);
  assert.deepEqual(released, [first.id]);

  leases.release(7, second);
  leases.release(7, second);
  assert.deepEqual(released, [first.id, second.id]);
  assert.equal(leases.isOwnedBy(7), false);

  const third = leases.acquire(9);
  leases.releaseOwner(9);
  assert.deepEqual(released, [first.id, second.id, third.id]);
});

test('consumes a Browser lease before invoking fallible native cleanup', () => {
  let cleanupAttempts = 0;
  const leases = createBrowserPluginLeaseRegistry(() => {
    cleanupAttempts += 1;
    throw new Error('native cleanup failed');
  });
  const lease = leases.acquire(7);

  assert.throws(() => leases.release(7, lease), /native cleanup failed/u);
  assert.doesNotThrow(() => leases.release(7, lease));
  assert.equal(cleanupAttempts, 1);
  assert.equal(leases.isOwnedBy(7), false);
});

test('activates the built-in Browser plugin through its contributed view', async () => {
  const backCalls: string[] = [];
  const lifecycle: string[] = [];
  const created = createPluginHost([
    createBrowserPluginModule(testRenderer(backCalls, lifecycle)),
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.deepEqual(created.value.listPlugins(), [browserPluginManifest]);
  assert.equal(created.value.listViews()[0]?.id, browserPluginViewId);
  assert.equal((await created.value.renderView(browserPluginViewId)).ok, true);
  assert.equal(
    (await created.value.executeCommand(browserPluginBackCommand)).ok,
    true,
  );
  assert.deepEqual(backCalls, ['back']);
  assert.deepEqual(lifecycle, ['acquire']);
  assert.equal((await created.value.disablePlugin(browserPluginManifest.id)).ok, true);
  assert.deepEqual(lifecycle, ['acquire', 'release:test-browser-lease']);
  assert.equal((await created.value.disablePlugin(browserPluginManifest.id)).ok, true);
  assert.deepEqual(lifecycle, ['acquire', 'release:test-browser-lease']);
});

test('fails Browser activation when main does not acknowledge its lease', async () => {
  const renderer: BrowserPluginRendererApi = {
    ...testRenderer([]),
    acquireBrowserPlugin: async () => ({
      ok: false,
      error: { code: 'unavailable', message: 'Browser is unavailable.' },
    }),
  };
  const created = createPluginHost([createBrowserPluginModule(renderer)]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const result = await created.value.renderView(browserPluginViewId);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.error instanceof PluginActivationError);
});

test('reports Browser release failures through plugin deactivation', async () => {
  const renderer: BrowserPluginRendererApi = {
    ...testRenderer([]),
    releaseBrowserPlugin: async () => ({
      ok: false,
      error: { code: 'unavailable', message: 'Browser release failed.' },
    }),
  };
  const created = createPluginHost([createBrowserPluginModule(renderer)]);
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal((await created.value.renderView(browserPluginViewId)).ok, true);

  const result = await created.value.disablePlugin(browserPluginManifest.id);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.error instanceof PluginDeactivationError);
});
