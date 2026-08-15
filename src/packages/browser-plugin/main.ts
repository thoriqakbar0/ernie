import { BrowserWindow, ipcMain, WebContentsView } from 'electron';

import {
  createBrowserPluginMainController,
  type BrowserPluginIpcMain,
  type BrowserPluginMainPortController,
  type BrowserPluginPage,
  type BrowserPluginWindow,
} from './main-controller.js';
import { parseJsonValue } from '../json-value/index.js';

/** Main-process ownership for the Browser plugin's native page view and IPC handlers. */
export interface BrowserPluginMainController {
  /** Attach browser rendering to the active Ernie window. */
  attachWindow(window: BrowserWindow): void;

  /** Remove handlers and release native browser resources. */
  dispose(): void;
}

function createPageAdapter(window: BrowserWindow): BrowserPluginPage {
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:ernie-browser-plugin',
      sandbox: true,
    },
  });
  const { webContents } = view;
  const { session } = webContents;

  return {
    get url() {
      return webContents.getURL();
    },
    get title() {
      return webContents.getTitle();
    },
    get loading() {
      return webContents.isLoading();
    },
    get canGoBack() {
      return webContents.navigationHistory.canGoBack();
    },
    get canGoForward() {
      return webContents.navigationHistory.canGoForward();
    },
    get destroyed() {
      return webContents.isDestroyed();
    },
    attach() {
      window.contentView.addChildView(view);
    },
    detach() {
      if (!window.isDestroyed()) window.contentView.removeChildView(view);
    },
    setBackgroundColor(color) {
      view.setBackgroundColor(color);
    },
    denyPermissionRequests() {
      session.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
    },
    clearPermissionRequestHandler() {
      session.setPermissionRequestHandler(null);
    },
    setWindowOpenHandler(handler) {
      webContents.setWindowOpenHandler((details) => {
        handler(details.url);
        return { action: 'deny' };
      });
    },
    onWillNavigate(handler) {
      webContents.on('will-navigate', (event) => {
        handler(event.url, () => event.preventDefault());
      });
    },
    onNavigationStateChange(handler) {
      webContents.on('did-start-loading', handler);
      webContents.on('did-stop-loading', handler);
      webContents.on('did-navigate', handler);
      webContents.on('did-navigate-in-page', handler);
      webContents.on('page-title-updated', handler);
    },
    setBounds(bounds) {
      view.setBounds(bounds);
    },
    setVisible(visible) {
      view.setVisible(visible);
    },
    loadUrl(url) {
      return webContents.loadURL(url);
    },
    goBack() {
      webContents.navigationHistory.goBack();
    },
    goForward() {
      webContents.navigationHistory.goForward();
    },
    reload() {
      webContents.reload();
    },
    close() {
      webContents.close();
    },
  };
}

function createWindowAdapter(window: BrowserWindow): BrowserPluginWindow {
  return {
    renderer: window.webContents,
    get destroyed() {
      return window.isDestroyed();
    },
    sendState(channel, state) {
      window.webContents.send(channel, state);
    },
    createPage() {
      return createPageAdapter(window);
    },
    onRendererProcessGone(listener) {
      const electronListener = (): void => listener();
      window.webContents.on('render-process-gone', electronListener);
      return () => window.webContents.off('render-process-gone', electronListener);
    },
    onClosed(listener) {
      const electronListener = (): void => listener();
      window.once('closed', electronListener);
      return () => window.off('closed', electronListener);
    },
  };
}

function registerController(): BrowserPluginMainPortController {
  const browserIpcMain: BrowserPluginIpcMain = {
    handle(channel, handler) {
      ipcMain.handle(channel, (event, ...rawArguments) => {
        const arguments_ = rawArguments.map(parseJsonValue);
        return handler({ sender: event.sender }, ...arguments_);
      });
    },
    removeHandler(channel) {
      ipcMain.removeHandler(channel);
    },
  };
  return createBrowserPluginMainController(browserIpcMain, (failure) => {
    console.error(failure.message);
  });
}

/** Register Browser plugin IPC once and return its explicit lifecycle owner. */
export function registerBrowserPluginMain(): BrowserPluginMainController {
  const controller = registerController();
  return {
    attachWindow(window) {
      controller.attachWindow(createWindowAdapter(window));
    },
    dispose() {
      controller.dispose();
    },
  };
}
