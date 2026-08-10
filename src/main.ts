import path from 'node:path';

import { app, BrowserWindow, ipcMain } from 'electron';
import type { IpcMainEvent } from 'electron';

import {
  deleteLocalGitBranch,
  initializeLocalGitRepository,
  readLocalGitBranches,
  renameLocalGitBranch,
  switchLocalGitBranch,
} from './packages/prime-agent-daemon/git-server';
import { createPrimeAgentDaemon } from './packages/prime-agent-daemon/server';
import {
  primeAgentGitBranchesChannel,
  primeAgentInitializeGitChannel,
  primeAgentDeleteGitBranchChannel,
  primeAgentModelsChannel,
  primeAgentRlmDepthChannel,
  primeAgentRenameGitBranchChannel,
  primeAgentSetModelChannel,
  primeAgentSetRlmDepthChannel,
  primeAgentSwitchGitBranchChannel,
  primeAgentWorkspaceChannel,
  rendererReadyChannel,
} from './renderer-api';

const rendererReadyTimeoutMs = 5_000;
const developmentRendererUrlEnvironmentName = 'ERNIE_RENDERER_URL';

class RendererReadyTimeoutError extends Error {
  readonly _tag = 'RendererReadyTimeoutError';

  constructor() {
    super(`Renderer did not become ready within ${rendererReadyTimeoutMs} ms.`);
  }
}

class WindowClosedBeforeReadyError extends Error {
  readonly _tag = 'WindowClosedBeforeReadyError';

  constructor() {
    super('Window closed before its renderer was ready.');
  }
}

class InvalidDevelopmentRendererUrlError extends Error {
  readonly _tag = 'InvalidDevelopmentRendererUrlError';

  constructor(value: string) {
    super(`Invalid ${developmentRendererUrlEnvironmentName}: ${value}`);
  }
}

let mainWindow: BrowserWindow | null = null;

function readDevelopmentRendererUrl(): URL | null {
  const value = process.env[developmentRendererUrlEnvironmentName];
  if (value === undefined) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
      throw new InvalidDevelopmentRendererUrlError(value);
    }
    return url;
  } catch (error) {
    if (error instanceof InvalidDevelopmentRendererUrlError) throw error;
    throw new InvalidDevelopmentRendererUrlError(value);
  }
}

function registerPrimeAgentHandlers(): void {
  const daemon = createPrimeAgentDaemon(process.cwd());

  ipcMain.handle(primeAgentWorkspaceChannel, () => daemon.listWorkspace());
  ipcMain.handle(
    primeAgentModelsChannel,
    (_event, activeSessionId: unknown) => daemon.listModels(activeSessionId),
  );
  ipcMain.handle(primeAgentSetModelChannel, (_event, selection: unknown) =>
    daemon.setModel(selection),
  );
  ipcMain.handle(
    primeAgentRlmDepthChannel,
    (_event, activeSessionId: unknown) => daemon.getRlmDepth(activeSessionId),
  );
  ipcMain.handle(primeAgentSetRlmDepthChannel, (_event, selection: unknown) =>
    daemon.setRlmDepth(selection),
  );
  ipcMain.handle(primeAgentGitBranchesChannel, (_event, cwd: unknown) =>
    readLocalGitBranches(cwd),
  );
  ipcMain.handle(
    primeAgentSwitchGitBranchChannel,
    (_event, selection: unknown) => switchLocalGitBranch(selection),
  );
  ipcMain.handle(
    primeAgentDeleteGitBranchChannel,
    (_event, selection: unknown) => deleteLocalGitBranch(selection),
  );
  ipcMain.handle(
    primeAgentRenameGitBranchChannel,
    (_event, rename: unknown) => renameLocalGitBranch(rename),
  );
  ipcMain.handle(primeAgentInitializeGitChannel, (_event, cwd: unknown) =>
    initializeLocalGitRepository(cwd),
  );
}

function waitForRendererReady(window: BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (complete: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      ipcMain.off(rendererReadyChannel, onRendererReady);
      window.off('closed', onWindowClosed);
      complete();
    };

    const onRendererReady = (event: IpcMainEvent): void => {
      if (event.sender !== window.webContents) {
        return;
      }

      finish(resolve);
    };

    const onWindowClosed = (): void => {
      finish(() => reject(new WindowClosedBeforeReadyError()));
    };

    const timeoutId = setTimeout(() => {
      finish(() => reject(new RendererReadyTimeoutError()));
    }, rendererReadyTimeoutMs);

    ipcMain.on(rendererReadyChannel, onRendererReady);
    window.once('closed', onWindowClosed);
  });
}

function waitForReadyToShow(window: BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      window.off('ready-to-show', onReadyToShow);
      window.off('closed', onWindowClosed);
    };

    const onReadyToShow = (): void => {
      cleanup();
      resolve();
    };

    const onWindowClosed = (): void => {
      cleanup();
      reject(new WindowClosedBeforeReadyError());
    };

    window.once('ready-to-show', onReadyToShow);
    window.once('closed', onWindowClosed);
  });
}

async function createWindow(): Promise<BrowserWindow> {
  const developmentRendererUrl = readDevelopmentRendererUrl();
  const iconPath = path.join(__dirname, '../renderer/ernie-logo.png');
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 820,
    minHeight: 520,
    backgroundColor: '#fbf8f2',
    icon: iconPath,
    show: false,
    title: 'Ernie',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
    },
  });

  mainWindow = window;
  window.once('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  const readyToShow = waitForReadyToShow(window);
  const rendererReady = waitForRendererReady(window);

  try {
    await Promise.all([
      developmentRendererUrl === null
        ? window.loadFile(path.join(__dirname, '../renderer/index.html'))
        : window.loadURL(developmentRendererUrl.href),
      readyToShow,
      rendererReady,
    ]);
  } catch (error) {
    if (!window.isDestroyed()) {
      window.destroy();
    }

    throw error;
  }

  window.show();
  return window;
}

function reportStartupFailure(error: unknown): void {
  console.error('Ernie could not open its main window.', error);
  app.quit();
}

async function startApplication(): Promise<void> {
  await app.whenReady();
  registerPrimeAgentHandlers();

  if (process.platform === 'darwin' && app.dock !== undefined) {
    app.dock.setIcon(path.join(__dirname, '../renderer/ernie-logo.png'));
  }

  await createWindow();

  app.on('activate', () => {
    if (mainWindow === null || mainWindow.isDestroyed()) {
      void createWindow().catch(reportStartupFailure);
      return;
    }

    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

void startApplication().catch(reportStartupFailure);
