import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  browserPluginBackCommand,
  browserPluginManifest,
  browserPluginViewId,
  createBrowserPluginModule,
  parseBrowserPluginResult,
  resolveBrowserAddress,
  type BrowserPluginRendererApi,
} from '@/packages/browser-plugin';
import { createPluginHost } from '@/packages/plugin-host';

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

function testRenderer(backCalls: string[]): BrowserPluginRendererApi {
  return {
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
});

test('activates the built-in Browser plugin through its contributed view', async () => {
  const backCalls: string[] = [];
  const created = createPluginHost([
    createBrowserPluginModule(testRenderer(backCalls)),
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.deepEqual(created.value.listPlugins(), [browserPluginManifest]);
  assert.equal(created.value.listViews()[0]?.id, browserPluginViewId);
  assert.equal((await created.value.activateView(browserPluginViewId)).ok, true);
  assert.equal(
    (await created.value.executeCommand(browserPluginBackCommand)).ok,
    true,
  );
  assert.deepEqual(backCalls, ['back']);
});
