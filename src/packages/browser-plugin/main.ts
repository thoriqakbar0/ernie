import {
  BrowserWindow,
  ipcMain,
  WebContentsView,
  type IpcMainInvokeEvent,
  type Session,
} from 'electron';

import {
  browserPluginAcquireChannel,
  browserPluginBackChannel,
  browserPluginForwardChannel,
  browserPluginHideChannel,
  browserPluginHomeUrl,
  browserPluginNavigateChannel,
  browserPluginReloadChannel,
  browserPluginReleaseChannel,
  browserPluginShowChannel,
  browserPluginStateChannel,
  createBrowserPluginLeaseRegistry,
  resolveBrowserAddress,
  type BrowserPluginBounds,
  type BrowserPluginErrorCode,
  type BrowserPluginLease,
  type BrowserPluginState,
} from './index.js';
import {
  isJsonNumber,
  isJsonRecord,
  isJsonString,
  type JsonValue,
} from '../json-value/index.js';

/** Main-process ownership for the Browser plugin's native page view and IPC handlers. */
export interface BrowserPluginMainController {
  /** Attach browser rendering to the active Ernie window. */
  attachWindow(window: BrowserWindow): void;

  /** Remove handlers and release native browser resources. */
  dispose(): void;
}

function successfulResponse(state: BrowserPluginState): JsonValue {
  return { ok: true, state: { ...state } };
}

function failedResponse(code: BrowserPluginErrorCode, message: string): JsonValue {
  return { ok: false, error: { code, message } };
}

function successfulLeaseResponse(lease: BrowserPluginLease): JsonValue {
  return { ok: true, lease: { ...lease } };
}

function successfulAcknowledgement(): JsonValue {
  return { ok: true };
}

function parseLease(value: JsonValue): BrowserPluginLease | null {
  if (!isJsonRecord(value) || !isJsonString(value.id) || value.id.length === 0) {
    return null;
  }
  return Object.freeze({ id: value.id });
}

function parseBounds(value: JsonValue): BrowserPluginBounds | null {
  if (!isJsonRecord(value)) return null;
  const { x, y, width, height } = value;
  if (
    !isJsonNumber(x) ||
    !isJsonNumber(y) ||
    !isJsonNumber(width) ||
    !isJsonNumber(height) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    x < 0 ||
    y < 0 ||
    width < 1 ||
    height < 1
  ) {
    return null;
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** Register Browser plugin IPC once and return its explicit lifecycle owner. */
export function registerBrowserPluginMain(): BrowserPluginMainController {
  let activeWindow: BrowserWindow | null = null;
  let browserView: WebContentsView | null = null;
  let browserSession: Session | null = null;
  let initialNavigation: Promise<void> | null = null;
  let disposed = false;

  const navigationState = (): BrowserPluginState => {
    if (browserView === null || browserView.webContents.isDestroyed()) {
      return {
        url: '',
        title: 'New tab',
        loading: false,
        canGoBack: false,
        canGoForward: false,
      };
    }
    const { webContents } = browserView;
    return {
      url: webContents.getURL(),
      title: webContents.getTitle() || 'New tab',
      loading: webContents.isLoading(),
      canGoBack: webContents.navigationHistory.canGoBack(),
      canGoForward: webContents.navigationHistory.canGoForward(),
    };
  };

  const publishState = (): void => {
    if (activeWindow === null || activeWindow.isDestroyed()) return;
    activeWindow.webContents.send(browserPluginStateChannel, navigationState());
  };

  const releaseView = (): void => {
    const view = browserView;
    const session = browserSession;
    if (view === null) return;
    browserView = null;
    browserSession = null;
    initialNavigation = null;

    const failures: unknown[] = [];
    const attempt = (cleanup: () => void): void => {
      try {
        cleanup();
      } catch (cause) {
        failures.push(cause);
      }
    };
    attempt(() => view.setVisible(false));
    if (activeWindow !== null && !activeWindow.isDestroyed()) {
      attempt(() => activeWindow?.contentView.removeChildView(view));
    }
    attempt(() => session?.setPermissionRequestHandler(null));
    if (!view.webContents.isDestroyed()) {
      attempt(() => view.webContents.close());
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Browser native cleanup failed.');
    }
  };

  const leases = createBrowserPluginLeaseRegistry(() => releaseView());

  const navigate = async (address: string): Promise<JsonValue> => {
    const destination = resolveBrowserAddress(address);
    if (!destination.ok) {
      return failedResponse('invalid-address', destination.error.message);
    }
    if (browserView === null || browserView.webContents.isDestroyed()) {
      return failedResponse('unavailable', 'Open the Browser plugin before navigating.');
    }
    try {
      await browserView.webContents.loadURL(destination.value);
      return successfulResponse(navigationState());
    } catch {
      return failedResponse('navigation-failed', 'The page could not be loaded.');
    }
  };

  const ensureView = (ownerId: number): WebContentsView | null => {
    if (
      disposed ||
      !leases.isOwnedBy(ownerId) ||
      activeWindow === null ||
      activeWindow.isDestroyed()
    ) {
      return null;
    }
    if (browserView !== null && !browserView.webContents.isDestroyed()) {
      return browserView;
    }
    if (browserView !== null) releaseView();

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:ernie-browser-plugin',
        sandbox: true,
      },
    });
    const session = view.webContents.session;
    try {
      view.setBackgroundColor('#ffffff');
      session.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      view.webContents.setWindowOpenHandler((details) => {
        void navigate(details.url);
        return { action: 'deny' };
      });
      view.webContents.on('will-navigate', (event) => {
        if (!resolveBrowserAddress(event.url).ok) event.preventDefault();
      });
      view.webContents.on('did-start-loading', publishState);
      view.webContents.on('did-stop-loading', publishState);
      view.webContents.on('did-navigate', publishState);
      view.webContents.on('did-navigate-in-page', publishState);
      view.webContents.on('page-title-updated', publishState);
      activeWindow.contentView.addChildView(view);
    } catch (cause) {
      session.setPermissionRequestHandler(null);
      if (!view.webContents.isDestroyed()) view.webContents.close();
      throw cause;
    }
    browserView = view;
    browserSession = session;
    return view;
  };

  const senderIsActiveWindow = (event: IpcMainInvokeEvent): boolean =>
    activeWindow !== null &&
    !activeWindow.isDestroyed() &&
    event.sender === activeWindow.webContents;

  const senderHasActiveLease = (event: IpcMainInvokeEvent): boolean =>
    senderIsActiveWindow(event) && leases.isOwnedBy(event.sender.id);

  ipcMain.handle(browserPluginAcquireChannel, (event): JsonValue => {
    if (!senderIsActiveWindow(event)) {
      return failedResponse('unavailable', 'Browser is unavailable.');
    }
    return successfulLeaseResponse(leases.acquire(event.sender.id));
  });
  ipcMain.handle(
    browserPluginReleaseChannel,
    (event, rawLease: JsonValue): JsonValue => {
      const lease = parseLease(rawLease);
      if (!senderIsActiveWindow(event) || lease === null) {
        return failedResponse('unavailable', 'Browser lease is unavailable.');
      }
      leases.release(event.sender.id, lease);
      return successfulAcknowledgement();
    },
  );

  ipcMain.handle(
    browserPluginShowChannel,
    async (event, rawBounds: JsonValue): Promise<JsonValue> => {
      if (!senderHasActiveLease(event)) {
        return failedResponse('unavailable', 'Browser is unavailable.');
      }
      const bounds = parseBounds(rawBounds);
      if (bounds === null) {
        return failedResponse('invalid-bounds', 'Browser page bounds are invalid.');
      }
      const view = ensureView(event.sender.id);
      if (view === null) {
        return failedResponse('unavailable', 'Browser is unavailable.');
      }
      view.setBounds(bounds);
      view.setVisible(true);
      if (view.webContents.getURL().length === 0) {
        initialNavigation ??= view.webContents.loadURL(browserPluginHomeUrl);
        try {
          await initialNavigation;
        } catch {
          initialNavigation = null;
          return failedResponse('navigation-failed', 'The Browser home page could not be loaded.');
        }
      }
      return successfulResponse(navigationState());
    },
  );
  ipcMain.handle(browserPluginHideChannel, (event): JsonValue => {
    if (!senderHasActiveLease(event)) {
      return failedResponse('unavailable', 'Browser is unavailable.');
    }
    browserView?.setVisible(false);
    return successfulResponse(navigationState());
  });
  ipcMain.handle(
    browserPluginNavigateChannel,
    async (event, rawAddress: JsonValue): Promise<JsonValue> => {
      if (!senderHasActiveLease(event) || !isJsonString(rawAddress)) {
        return failedResponse('invalid-address', 'Enter a valid web address or search term.');
      }
      return navigate(rawAddress);
    },
  );
  ipcMain.handle(browserPluginBackChannel, (event): JsonValue => {
    if (!senderHasActiveLease(event) || browserView === null) {
      return failedResponse('unavailable', 'Browser is unavailable.');
    }
    if (browserView.webContents.navigationHistory.canGoBack()) {
      browserView.webContents.navigationHistory.goBack();
    }
    return successfulResponse(navigationState());
  });
  ipcMain.handle(browserPluginForwardChannel, (event): JsonValue => {
    if (!senderHasActiveLease(event) || browserView === null) {
      return failedResponse('unavailable', 'Browser is unavailable.');
    }
    if (browserView.webContents.navigationHistory.canGoForward()) {
      browserView.webContents.navigationHistory.goForward();
    }
    return successfulResponse(navigationState());
  });
  ipcMain.handle(browserPluginReloadChannel, (event): JsonValue => {
    if (!senderHasActiveLease(event) || browserView === null) {
      return failedResponse('unavailable', 'Browser is unavailable.');
    }
    browserView.webContents.reload();
    return successfulResponse(navigationState());
  });

  return {
    attachWindow(window) {
      leases.releaseAll();
      activeWindow = window;
      window.webContents.on('render-process-gone', () => {
        if (activeWindow !== window) return;
        leases.releaseOwner(window.webContents.id);
      });
      window.once('closed', () => {
        if (activeWindow !== window) return;
        leases.releaseOwner(window.webContents.id);
        activeWindow = null;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        leases.releaseAll();
      } finally {
        activeWindow = null;
        ipcMain.removeHandler(browserPluginAcquireChannel);
        ipcMain.removeHandler(browserPluginReleaseChannel);
        ipcMain.removeHandler(browserPluginShowChannel);
        ipcMain.removeHandler(browserPluginHideChannel);
        ipcMain.removeHandler(browserPluginNavigateChannel);
        ipcMain.removeHandler(browserPluginBackChannel);
        ipcMain.removeHandler(browserPluginForwardChannel);
        ipcMain.removeHandler(browserPluginReloadChannel);
      }
    },
  };
}
