import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  browserPluginAcquireChannel,
  browserPluginBackCommand,
  browserPluginManifest,
  browserPluginReleaseChannel,
  browserPluginShowChannel,
  browserPluginViewId,
  createBrowserPluginLeaseRegistry,
  parseBrowserPluginAcknowledgement,
  parseBrowserPluginLeaseResult,
  parseBrowserPluginResult,
  resolveBrowserAddress,
  type BrowserPluginRendererApi,
} from '@/packages/browser-plugin';
import {
  createBrowserPluginMainController,
  type BrowserPluginCleanupFailure,
  type BrowserPluginIpcEvent,
  type BrowserPluginIpcMain,
  type BrowserPluginPage,
  type BrowserPluginRenderer,
  type BrowserPluginWindow,
} from '@/packages/browser-plugin/main-controller';
import { createBrowserPluginModule } from '@/packages/browser-plugin/view';
import type { JsonValue } from '@/packages/json-value';
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

type BrowserPluginIpcHandler = Parameters<BrowserPluginIpcMain['handle']>[1];

class TestBrowserPluginIpc implements BrowserPluginIpcMain {
  readonly handlers = new Map<string, BrowserPluginIpcHandler>();

  handle(channel: string, handler: BrowserPluginIpcHandler): void {
    this.handlers.set(channel, handler);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  async invoke(
    channel: string,
    sender: BrowserPluginRenderer,
    ...arguments_: readonly (JsonValue | undefined)[]
  ): Promise<JsonValue> {
    const handler = this.handlers.get(channel);
    assert.notEqual(handler, undefined);
    if (handler === undefined) throw new Error(`Missing IPC handler ${channel}.`);
    const event: BrowserPluginIpcEvent = { sender };
    return handler(event, ...arguments_);
  }
}

interface TestBrowserPluginPage extends BrowserPluginPage {
  cleanupFails: boolean;
  readonly events: string[];
}

function createTestPage(): TestBrowserPluginPage {
  let url = '';
  const events: string[] = [];
  return {
    cleanupFails: false,
    events,
    get url() {
      return url;
    },
    title: 'Test page',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    destroyed: false,
    attach() {
      events.push('attach');
    },
    detach() {
      events.push('detach');
      if (this.cleanupFails) throw new Error('detach failed');
    },
    setBackgroundColor() {
      events.push('background');
    },
    denyPermissionRequests() {
      events.push('deny permissions');
    },
    clearPermissionRequestHandler() {
      events.push('clear permissions');
      if (this.cleanupFails) throw new Error('permission cleanup failed');
    },
    setWindowOpenHandler() {
      events.push('window handler');
    },
    onWillNavigate() {
      events.push('navigation guard');
    },
    onNavigationStateChange() {
      events.push('state listener');
    },
    setBounds() {
      events.push('bounds');
    },
    setVisible(visible) {
      events.push(visible ? 'show' : 'hide');
      if (!visible && this.cleanupFails) throw new Error('hide failed');
    },
    async loadUrl(destination) {
      url = destination;
      events.push(`load:${destination}`);
    },
    goBack() {
      events.push('back');
    },
    goForward() {
      events.push('forward');
    },
    reload() {
      events.push('reload');
    },
    close() {
      events.push('close');
      if (this.cleanupFails) throw new Error('close failed');
    },
  };
}

interface TestBrowserPluginWindow {
  readonly port: BrowserPluginWindow;
  readonly rendererProcessGoneListeners: Set<() => void>;
  readonly closedListeners: Set<() => void>;
  emitRendererProcessGone(): void;
  emitClosed(): void;
}

function createTestWindow(
  rendererId: number,
  page: BrowserPluginPage,
): TestBrowserPluginWindow {
  const renderer: BrowserPluginRenderer = { id: rendererId };
  const rendererProcessGoneListeners = new Set<() => void>();
  const closedListeners = new Set<() => void>();
  const port: BrowserPluginWindow = {
    renderer,
    destroyed: false,
    sendState: () => undefined,
    createPage: () => page,
    onRendererProcessGone(listener) {
      rendererProcessGoneListeners.add(listener);
      return () => rendererProcessGoneListeners.delete(listener);
    },
    onClosed(listener) {
      closedListeners.add(listener);
      return () => closedListeners.delete(listener);
    },
  };
  return {
    port,
    rendererProcessGoneListeners,
    closedListeners,
    emitRendererProcessGone() {
      for (const listener of rendererProcessGoneListeners) listener();
    },
    emitClosed() {
      for (const listener of closedListeners) listener();
    },
  };
}

async function acquireAndShow(
  ipc: TestBrowserPluginIpc,
  window: BrowserPluginWindow,
): Promise<ReturnType<typeof parseBrowserPluginLeaseResult>> {
  const lease = parseBrowserPluginLeaseResult(
    await ipc.invoke(browserPluginAcquireChannel, window.renderer),
  );
  assert.equal(lease.ok, true);
  const shown = parseBrowserPluginResult(
    await ipc.invoke(browserPluginShowChannel, window.renderer, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    }),
  );
  assert.equal(shown.ok, true);
  return lease;
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
  const cleanupFailure = parseBrowserPluginAcknowledgement({
    ok: false,
    error: {
      code: 'cleanup-failed',
      message: 'Browser native cleanup failed.',
    },
  });
  assert.equal(cleanupFailure.ok, false);
  if (!cleanupFailure.ok) assert.equal(cleanupFailure.error.code, 'cleanup-failed');
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

test('returns typed cleanup failures from Browser lease IPC', async () => {
  const ipc = new TestBrowserPluginIpc();
  const page = createTestPage();
  const window = createTestWindow(7, page);
  const failures: BrowserPluginCleanupFailure[] = [];
  const controller = createBrowserPluginMainController(ipc, (failure) => {
    failures.push(failure);
  });
  controller.attachWindow(window.port);
  const lease = await acquireAndShow(ipc, window.port);
  assert.equal(lease.ok, true);
  if (!lease.ok) return;
  page.cleanupFails = true;

  assert.deepEqual(
    await ipc.invoke(browserPluginReleaseChannel, window.port.renderer, {
      id: lease.value.id,
    }),
    {
      ok: false,
      error: {
        code: 'cleanup-failed',
        message: 'Browser native cleanup failed.',
      },
    },
  );
  assert.deepEqual(
    await ipc.invoke(browserPluginReleaseChannel, window.port.renderer, {
      id: lease.value.id,
    }),
    { ok: true },
  );
  assert.equal(failures.length, 1);
  controller.dispose();
});

test('returns a typed failure when lease replacement cleanup fails', async () => {
  const ipc = new TestBrowserPluginIpc();
  const page = createTestPage();
  const window = createTestWindow(7, page);
  const failures: BrowserPluginCleanupFailure[] = [];
  const controller = createBrowserPluginMainController(ipc, (failure) => {
    failures.push(failure);
  });
  controller.attachWindow(window.port);
  await acquireAndShow(ipc, window.port);
  page.cleanupFails = true;

  assert.deepEqual(
    await ipc.invoke(browserPluginAcquireChannel, window.port.renderer),
    {
      ok: false,
      error: {
        code: 'cleanup-failed',
        message: 'Browser native cleanup failed.',
      },
    },
  );
  assert.equal(failures.length, 1);
  controller.dispose();
});

test('contains cleanup failures during renderer and window loss', async () => {
  const ipc = new TestBrowserPluginIpc();
  const failures: BrowserPluginCleanupFailure[] = [];
  const controller = createBrowserPluginMainController(ipc, (failure) => {
    failures.push(failure);
  });
  const rendererPage = createTestPage();
  const rendererWindow = createTestWindow(7, rendererPage);
  controller.attachWindow(rendererWindow.port);
  await acquireAndShow(ipc, rendererWindow.port);
  rendererPage.cleanupFails = true;

  assert.doesNotThrow(() => rendererWindow.emitRendererProcessGone());
  assert.equal(failures.length, 1);

  const closedPage = createTestPage();
  const closedWindow = createTestWindow(8, closedPage);
  controller.attachWindow(closedWindow.port);
  await acquireAndShow(ipc, closedWindow.port);
  closedPage.cleanupFails = true;

  assert.doesNotThrow(() => closedWindow.emitClosed());
  assert.equal(failures.length, 2);
  assert.deepEqual(
    await ipc.invoke(browserPluginAcquireChannel, closedWindow.port.renderer),
    {
      ok: false,
      error: { code: 'unavailable', message: 'Browser is unavailable.' },
    },
  );
  controller.dispose();
});

test('detaches Browser window listeners during replacement and disposal', () => {
  const ipc = new TestBrowserPluginIpc();
  const controller = createBrowserPluginMainController(ipc, () => undefined);
  const first = createTestWindow(7, createTestPage());
  const second = createTestWindow(8, createTestPage());

  controller.attachWindow(first.port);
  assert.equal(first.rendererProcessGoneListeners.size, 1);
  assert.equal(first.closedListeners.size, 1);

  controller.attachWindow(second.port);
  assert.equal(first.rendererProcessGoneListeners.size, 0);
  assert.equal(first.closedListeners.size, 0);
  assert.equal(second.rendererProcessGoneListeners.size, 1);
  assert.equal(second.closedListeners.size, 1);

  controller.dispose();
  assert.equal(second.rendererProcessGoneListeners.size, 0);
  assert.equal(second.closedListeners.size, 0);
  assert.equal(ipc.handlers.size, 0);
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
