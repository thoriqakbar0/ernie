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

/** Stable renderer identity shared by window and IPC adapters. */
export interface BrowserPluginRenderer {
  /** Electron renderer identifier used for lease ownership. */
  readonly id: number;
}

/** One renderer identity supplied by the main-process IPC adapter. */
export interface BrowserPluginIpcEvent {
  /** Renderer that invoked the IPC handler. */
  readonly sender: BrowserPluginRenderer;
}

/** IPC registration operations used by the Browser main-process controller. */
export interface BrowserPluginIpcMain {
  /** Register one request handler for a Browser IPC channel. */
  handle(
    channel: string,
    handler: (
      event: BrowserPluginIpcEvent,
      ...arguments_: readonly (JsonValue | undefined)[]
    ) => JsonValue | Promise<JsonValue>,
  ): void;

  /** Remove the request handler for one Browser IPC channel. */
  removeHandler(channel: string): void;
}

/** One native Browser page hidden behind the Electron composition boundary. */
export interface BrowserPluginPage {
  /** Current page address. */
  readonly url: string;
  /** Current page title. */
  readonly title: string;
  /** Whether the page is loading. */
  readonly loading: boolean;
  /** Whether backward navigation is available. */
  readonly canGoBack: boolean;
  /** Whether forward navigation is available. */
  readonly canGoForward: boolean;
  /** Whether Electron destroyed the underlying page. */
  readonly destroyed: boolean;

  /** Add the page to its owning window. */
  attach(): void;
  /** Remove the page from its owning window. */
  detach(): void;
  /** Set the native page background color. */
  setBackgroundColor(color: string): void;
  /** Deny permission requests from page content. */
  denyPermissionRequests(): void;
  /** Remove the page permission handler. */
  clearPermissionRequestHandler(): void;
  /** Handle attempted child-window creation. */
  setWindowOpenHandler(handler: (url: string) => void): void;
  /** Guard top-level navigation before Electron commits it. */
  onWillNavigate(handler: (url: string, preventDefault: () => void) => void): void;
  /** Observe navigation state changes. */
  onNavigationStateChange(handler: () => void): void;
  /** Position the page within its window. */
  setBounds(bounds: BrowserPluginBounds): void;
  /** Change page visibility. */
  setVisible(visible: boolean): void;
  /** Navigate the page to one resolved address. */
  loadUrl(url: string): Promise<void>;
  /** Move backward through page history. */
  goBack(): void;
  /** Move forward through page history. */
  goForward(): void;
  /** Reload the current page. */
  reload(): void;
  /** Close the native page and its web contents. */
  close(): void;
}

/** One Browser window projected from Electron into lifecycle-owned operations. */
export interface BrowserPluginWindow {
  /** Renderer identity associated with this window. */
  readonly renderer: BrowserPluginRenderer;
  /** Whether Electron destroyed the underlying window. */
  readonly destroyed: boolean;

  /** Send safe Browser state to the renderer. */
  sendState(channel: string, state: BrowserPluginState): void;
  /** Create a native page owned by this window. */
  createPage(): BrowserPluginPage;
  /** Observe renderer loss and return its listener cleanup. */
  onRendererProcessGone(listener: () => void): () => void;
  /** Observe window closure and return its listener cleanup. */
  onClosed(listener: () => void): () => void;
}

/** Safe diagnostic emitted when native Browser cleanup cannot finish. */
export interface BrowserPluginCleanupFailure {
  /** Stable failure discriminator. */
  readonly code: 'native-cleanup-failed';
  /** Safe failure message without native details. */
  readonly message: 'Browser native cleanup failed.';
}

/** Main-process ownership for Browser plugin resources and IPC handlers. */
export interface BrowserPluginMainPortController {
  /** Attach Browser rendering to the active window adapter. */
  attachWindow(window: BrowserPluginWindow): void;

  /** Remove handlers, listeners, and native Browser resources exactly once. */
  dispose(): void;
}

const cleanupFailure: BrowserPluginCleanupFailure = Object.freeze({
  code: 'native-cleanup-failed',
  message: 'Browser native cleanup failed.',
});

function successfulResponse(state: BrowserPluginState): JsonValue {
  return { ok: true, state: { ...state } };
}

function failedResponse(code: BrowserPluginErrorCode, message: string): JsonValue {
  return { ok: false, error: { code, message } };
}

function cleanupFailedResponse(): JsonValue {
  return failedResponse('cleanup-failed', cleanupFailure.message);
}

function successfulLeaseResponse(lease: BrowserPluginLease): JsonValue {
  return { ok: true, lease: { ...lease } };
}

function successfulAcknowledgement(): JsonValue {
  return { ok: true };
}

function parseLease(value: JsonValue | undefined): BrowserPluginLease | null {
  if (!isJsonRecord(value) || !isJsonString(value.id) || value.id.length === 0) {
    return null;
  }
  return Object.freeze({ id: value.id });
}

function parseBounds(value: JsonValue | undefined): BrowserPluginBounds | null {
  if (!isJsonRecord(value)) return null;
  const { x, y, width, height } = value;
  if (
    !isJsonNumber(x) ||
    !isJsonNumber(y) ||
    !isJsonNumber(width) ||
    !isJsonNumber(height) ||
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

/**
 * Create the Browser main-process controller from explicit IPC and window ports.
 *
 * Cleanup failures cross request boundaries as typed values. Event-driven cleanup
 * reports only the safe diagnostic supplied to `reportCleanupFailure`.
 */
export function createBrowserPluginMainController(
  ipcMain: BrowserPluginIpcMain,
  reportCleanupFailure: (failure: BrowserPluginCleanupFailure) => void,
): BrowserPluginMainPortController {
  let activeWindow: BrowserPluginWindow | null = null;
  let browserPage: BrowserPluginPage | null = null;
  let initialNavigation: Promise<void> | null = null;
  let disposed = false;
  let detachWindowListeners = (): void => undefined;

  const navigationState = (): BrowserPluginState => {
    if (browserPage === null || browserPage.destroyed) {
      return {
        url: '',
        title: 'New tab',
        loading: false,
        canGoBack: false,
        canGoForward: false,
      };
    }
    return {
      url: browserPage.url,
      title: browserPage.title || 'New tab',
      loading: browserPage.loading,
      canGoBack: browserPage.canGoBack,
      canGoForward: browserPage.canGoForward,
    };
  };

  const publishState = (): void => {
    if (activeWindow === null || activeWindow.destroyed) return;
    activeWindow.sendState(browserPluginStateChannel, navigationState());
  };

  const releasePage = (): void => {
    const page = browserPage;
    if (page === null) return;
    browserPage = null;
    initialNavigation = null;

    const failures: unknown[] = [];
    const attempt = (cleanup: () => void): void => {
      try {
        cleanup();
      } catch (cause) {
        failures.push(cause);
      }
    };
    attempt(() => page.setVisible(false));
    attempt(() => page.detach());
    attempt(() => page.clearPermissionRequestHandler());
    if (!page.destroyed) attempt(() => page.close());
    if (failures.length > 0) {
      throw new AggregateError(failures, cleanupFailure.message);
    }
  };

  const leases = createBrowserPluginLeaseRegistry(() => releasePage());

  const reportEventCleanupFailure = (release: () => void): void => {
    try {
      release();
    } catch {
      reportCleanupFailure(cleanupFailure);
    }
  };

  const releaseForRequest = (release: () => void): JsonValue => {
    try {
      release();
      return successfulAcknowledgement();
    } catch {
      reportCleanupFailure(cleanupFailure);
      return cleanupFailedResponse();
    }
  };

  const navigate = async (address: string): Promise<JsonValue> => {
    const destination = resolveBrowserAddress(address);
    if (!destination.ok) {
      return failedResponse('invalid-address', destination.error.message);
    }
    if (browserPage === null || browserPage.destroyed) {
      return failedResponse('unavailable', 'Open the Browser plugin before navigating.');
    }
    try {
      await browserPage.loadUrl(destination.value);
      return successfulResponse(navigationState());
    } catch {
      return failedResponse('navigation-failed', 'The page could not be loaded.');
    }
  };

  const ensurePage = (): BrowserPluginPage | null => {
    if (
      disposed ||
      activeWindow === null ||
      activeWindow.destroyed ||
      !leases.isOwnedBy(activeWindow.renderer.id)
    ) {
      return null;
    }
    if (browserPage !== null && !browserPage.destroyed) return browserPage;
    if (browserPage !== null) releasePage();

    const page = activeWindow.createPage();
    try {
      page.setBackgroundColor('#ffffff');
      page.denyPermissionRequests();
      page.setWindowOpenHandler((url) => {
        void navigate(url);
      });
      page.onWillNavigate((url, preventDefault) => {
        if (!resolveBrowserAddress(url).ok) preventDefault();
      });
      page.onNavigationStateChange(publishState);
      page.attach();
    } catch (cause) {
      let cleanupFailed = false;
      const attempt = (cleanup: () => void): void => {
        try {
          cleanup();
        } catch {
          cleanupFailed = true;
        }
      };
      attempt(() => page.detach());
      attempt(() => page.clearPermissionRequestHandler());
      if (!page.destroyed) attempt(() => page.close());
      if (cleanupFailed) {
        reportCleanupFailure(cleanupFailure);
      }
      throw cause;
    }
    browserPage = page;
    return page;
  };

  const senderIsActiveWindow = (event: BrowserPluginIpcEvent): boolean =>
    activeWindow !== null &&
    !activeWindow.destroyed &&
    event.sender === activeWindow.renderer;

  const senderHasActiveLease = (event: BrowserPluginIpcEvent): boolean => {
    const window = activeWindow;
    return (
      window !== null &&
      senderIsActiveWindow(event) &&
      leases.isOwnedBy(window.renderer.id)
    );
  };

  ipcMain.handle(browserPluginAcquireChannel, (event): JsonValue => {
    if (!senderIsActiveWindow(event) || activeWindow === null) {
      return failedResponse('unavailable', 'Browser is unavailable.');
    }
    try {
      return successfulLeaseResponse(leases.acquire(activeWindow.renderer.id));
    } catch {
      reportCleanupFailure(cleanupFailure);
      return cleanupFailedResponse();
    }
  });
  ipcMain.handle(
    browserPluginReleaseChannel,
    (event, serializedLease): JsonValue => {
      const lease = parseLease(serializedLease);
      if (!senderIsActiveWindow(event) || activeWindow === null || lease === null) {
        return failedResponse('unavailable', 'Browser lease is unavailable.');
      }
      const ownerId = activeWindow.renderer.id;
      return releaseForRequest(() => {
        leases.release(ownerId, lease);
      });
    },
  );

  ipcMain.handle(
    browserPluginShowChannel,
    async (event, serializedBounds): Promise<JsonValue> => {
      if (!senderHasActiveLease(event)) {
        return failedResponse('unavailable', 'Browser is unavailable.');
      }
      const bounds = parseBounds(serializedBounds);
      if (bounds === null) {
        return failedResponse('invalid-bounds', 'Browser page bounds are invalid.');
      }
      let page: BrowserPluginPage | null;
      try {
        page = ensurePage();
      } catch {
        return failedResponse('unavailable', 'Browser is unavailable.');
      }
      if (page === null) {
        return failedResponse('unavailable', 'Browser is unavailable.');
      }
      page.setBounds(bounds);
      page.setVisible(true);
      if (page.url.length === 0) {
        initialNavigation ??= page.loadUrl(browserPluginHomeUrl);
        try {
          await initialNavigation;
        } catch {
          initialNavigation = null;
          return failedResponse(
            'navigation-failed',
            'The Browser home page could not be loaded.',
          );
        }
      }
      return successfulResponse(navigationState());
    },
  );
  ipcMain.handle(browserPluginHideChannel, (event): JsonValue => {
    if (!senderHasActiveLease(event)) {
      return failedResponse('unavailable', 'Browser is unavailable.');
    }
    browserPage?.setVisible(false);
    return successfulResponse(navigationState());
  });
  ipcMain.handle(
    browserPluginNavigateChannel,
    async (event, address): Promise<JsonValue> => {
      if (!senderHasActiveLease(event) || !isJsonString(address)) {
        return failedResponse(
          'invalid-address',
          'Enter a valid web address or search term.',
        );
      }
      return navigate(address);
    },
  );
  ipcMain.handle(browserPluginBackChannel, (event): JsonValue => {
    if (!senderHasActiveLease(event) || browserPage === null) {
      return failedResponse('unavailable', 'Browser is unavailable.');
    }
    if (browserPage.canGoBack) browserPage.goBack();
    return successfulResponse(navigationState());
  });
  ipcMain.handle(browserPluginForwardChannel, (event): JsonValue => {
    if (!senderHasActiveLease(event) || browserPage === null) {
      return failedResponse('unavailable', 'Browser is unavailable.');
    }
    if (browserPage.canGoForward) browserPage.goForward();
    return successfulResponse(navigationState());
  });
  ipcMain.handle(browserPluginReloadChannel, (event): JsonValue => {
    if (!senderHasActiveLease(event) || browserPage === null) {
      return failedResponse('unavailable', 'Browser is unavailable.');
    }
    browserPage.reload();
    return successfulResponse(navigationState());
  });

  const clearWindowListeners = (): void => {
    const detach = detachWindowListeners;
    detachWindowListeners = (): void => undefined;
    detach();
  };

  return {
    attachWindow(window) {
      if (disposed) return;
      clearWindowListeners();
      reportEventCleanupFailure(() => leases.releaseAll());
      activeWindow = window;

      const detachRendererListener = window.onRendererProcessGone(() => {
        if (activeWindow !== window) return;
        reportEventCleanupFailure(() => leases.releaseOwner(window.renderer.id));
      });
      const detachClosedListener = window.onClosed(() => {
        if (activeWindow !== window) return;
        clearWindowListeners();
        try {
          reportEventCleanupFailure(() => leases.releaseOwner(window.renderer.id));
        } finally {
          activeWindow = null;
        }
      });
      let detached = false;
      detachWindowListeners = (): void => {
        if (detached) return;
        detached = true;
        detachRendererListener();
        detachClosedListener();
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearWindowListeners();
      try {
        reportEventCleanupFailure(() => leases.releaseAll());
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
