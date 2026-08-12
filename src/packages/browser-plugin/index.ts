import {
  currentPluginApiVersion,
  type PluginManifest,
  type PluginResult,
} from '../plugin-host/index.js';
import {
  isJsonBoolean,
  isJsonRecord,
  isJsonString,
  type JsonValue,
} from '../json-value/index.js';

/** IPC channel that shows and positions the Browser plugin's native page view. */
export const browserPluginShowChannel = 'ernie:plugin:browser:show';

/** IPC channel that hides the Browser plugin's native page view. */
export const browserPluginHideChannel = 'ernie:plugin:browser:hide';

/** IPC channel that navigates the Browser plugin to an address. */
export const browserPluginNavigateChannel = 'ernie:plugin:browser:navigate';

/** IPC channel that moves the Browser plugin backward in history. */
export const browserPluginBackChannel = 'ernie:plugin:browser:back';

/** IPC channel that moves the Browser plugin forward in history. */
export const browserPluginForwardChannel = 'ernie:plugin:browser:forward';

/** IPC channel that reloads the Browser plugin's current page. */
export const browserPluginReloadChannel = 'ernie:plugin:browser:reload';

/** IPC channel that streams Browser plugin navigation state to the renderer. */
export const browserPluginStateChannel = 'ernie:plugin:browser:state';

/** Stable identifier for Ernie's first built-in plugin. */
export const browserPluginId = 'ernie.browser';

/** Stable identifier for the Browser plugin's primary workbench view. */
export const browserPluginViewId = 'ernie.browser.main';

/** Command that moves the Browser plugin backward in history. */
export const browserPluginBackCommand = 'ernie.browser.back';

/** Command that moves the Browser plugin forward in history. */
export const browserPluginForwardCommand = 'ernie.browser.forward';

/** Command that reloads the Browser plugin's current page. */
export const browserPluginReloadCommand = 'ernie.browser.reload';

/** The safe first page loaded when the Browser plugin opens. */
export const browserPluginHomeUrl = 'https://www.google.com/';

/** Integer renderer coordinates used to place the native browser page. */
export interface BrowserPluginBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Navigation state projected from Electron without exposing page content. */
export interface BrowserPluginState {
  readonly url: string;
  readonly title: string;
  readonly loading: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}

/** Safe error codes returned across the Browser plugin IPC boundary. */
export type BrowserPluginErrorCode =
  | 'invalid-address'
  | 'invalid-bounds'
  | 'unavailable'
  | 'navigation-failed';

/** A Browser plugin operation failed with a safe renderer-facing message. */
export class BrowserPluginOperationError extends Error {
  readonly _tag = 'BrowserPluginOperationError';

  constructor(
    readonly code: BrowserPluginErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** A successful Browser plugin state or a typed operation failure. */
export type BrowserPluginResult = PluginResult<
  BrowserPluginState,
  BrowserPluginOperationError
>;

/** Renderer methods supplied to the Browser plugin through Ernie's preload. */
export interface BrowserPluginRendererApi {
  showBrowserPlugin(bounds: BrowserPluginBounds): Promise<JsonValue>;
  hideBrowserPlugin(): Promise<JsonValue>;
  navigateBrowserPlugin(address: string): Promise<JsonValue>;
  goBackBrowserPlugin(): Promise<JsonValue>;
  goForwardBrowserPlugin(): Promise<JsonValue>;
  reloadBrowserPlugin(): Promise<JsonValue>;
  onBrowserPluginState(listener: BrowserPluginStateListener): () => void;
}

/** One listener for serialized Browser plugin navigation updates. */
export type BrowserPluginStateListener = (value: JsonValue) => void;

/** Built-in Browser plugin metadata available before its code activates. */
export const browserPluginManifest: PluginManifest = Object.freeze({
  apiVersion: currentPluginApiVersion,
  id: browserPluginId,
  name: 'Browser',
  version: '0.1.0',
  description: 'Browse and inspect the web without leaving Ernie.',
  activationEvents: Object.freeze([
    Object.freeze({ event: 'view', viewId: browserPluginViewId }),
  ]),
  contributes: Object.freeze({
    commands: Object.freeze([
      Object.freeze({ id: browserPluginBackCommand, title: 'Browser: Back' }),
      Object.freeze({ id: browserPluginForwardCommand, title: 'Browser: Forward' }),
      Object.freeze({ id: browserPluginReloadCommand, title: 'Browser: Reload' }),
    ]),
    views: Object.freeze([
      Object.freeze({
        id: browserPluginViewId,
        title: 'Browser',
        description: 'Browse and inspect the web without leaving Ernie.',
        icon: 'globe',
        location: 'primary',
      }),
    ]),
  }),
});

function addressFailure(
  message: string,
): PluginResult<string, BrowserPluginOperationError> {
  return {
    ok: false,
    error: new BrowserPluginOperationError('invalid-address', message),
  };
}

function safeWebUrl(
  value: string,
): PluginResult<string, BrowserPluginOperationError> {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return addressFailure('Browser addresses must use HTTP or HTTPS.');
    }
    return { ok: true, value: url.href };
  } catch {
    return addressFailure('Enter a valid web address or search term.');
  }
}

/** Resolve user-entered text to an HTTP address or a Google search. */
export function resolveBrowserAddress(
  address: string,
): PluginResult<string, BrowserPluginOperationError> {
  const value = address.trim();
  if (value.length === 0) return addressFailure('Enter a web address or search term.');

  const localAddress = /^localhost(?::\d+)?(?:\/|$)/u.test(value);
  if (localAddress) return safeWebUrl(`http://${value}`);

  const explicitProtocol = /^[A-Za-z][A-Za-z\d+.-]*:/u.test(value);
  if (explicitProtocol) return safeWebUrl(value);

  const likelyHost = /^[^\s/]+\.[^\s/]+(?:\/.*)?$/u.test(value);
  if (likelyHost) {
    return safeWebUrl(`https://${value}`);
  }

  return {
    ok: true,
    value: `https://www.google.com/search?q=${encodeURIComponent(value)}`,
  };
}

/** Parse one serialized Browser plugin state update. */
export function parseBrowserPluginState(
  value: JsonValue,
): PluginResult<BrowserPluginState, BrowserPluginOperationError> {
  if (!isJsonRecord(value)) {
    return {
      ok: false,
      error: new BrowserPluginOperationError(
        'unavailable',
        'Browser state is unavailable.',
      ),
    };
  }
  const url = value.url;
  const title = value.title;
  const loading = value.loading;
  const canGoBack = value.canGoBack;
  const canGoForward = value.canGoForward;
  if (
    !isJsonString(url) ||
    !isJsonString(title) ||
    !isJsonBoolean(loading) ||
    !isJsonBoolean(canGoBack) ||
    !isJsonBoolean(canGoForward)
  ) {
    return {
      ok: false,
      error: new BrowserPluginOperationError(
        'unavailable',
        'Browser state is unavailable.',
      ),
    };
  }
  return {
    ok: true,
    value: { url, title, loading, canGoBack, canGoForward },
  };
}

/** Parse one serialized Browser plugin operation result. */
export function parseBrowserPluginResult(value: JsonValue): BrowserPluginResult {
  if (!isJsonRecord(value) || !isJsonBoolean(value.ok)) {
    return {
      ok: false,
      error: new BrowserPluginOperationError(
        'unavailable',
        'Browser did not return a valid response.',
      ),
    };
  }
  if (value.ok) return parseBrowserPluginState(value.state);

  const failure = value.error;
  if (!isJsonRecord(failure)) {
    return {
      ok: false,
      error: new BrowserPluginOperationError('unavailable', 'Browser is unavailable.'),
    };
  }
  const code = failure.code;
  const message = failure.message;
  if (
    (code !== 'invalid-address' &&
      code !== 'invalid-bounds' &&
      code !== 'unavailable' &&
      code !== 'navigation-failed') ||
    !isJsonString(message)
  ) {
    return {
      ok: false,
      error: new BrowserPluginOperationError('unavailable', 'Browser is unavailable.'),
    };
  }
  return { ok: false, error: new BrowserPluginOperationError(code, message) };
}
