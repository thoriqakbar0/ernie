import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import type {
  IpcMainEvent,
  MenuItemConstructorOptions,
  OpenDialogOptions,
} from 'electron';
import { Effect } from 'effect';
import { isJsonString, type JsonValue } from './packages/json-value/index.js';

import {
  createLocalGitWorktree,
  deleteLocalGitBranch,
  initializeLocalGitRepository,
  readLocalGitBranches,
  readLocalGitWorkspace,
  renameLocalGitBranch,
  switchLocalGitBranch,
} from './packages/prime-agent-daemon/git-server.js';
import { createPrimeAgentDaemon } from './packages/prime-agent-daemon/server.js';
import {
  chooseWorkspaceDirectoryChannel,
  primeAgentCreateSessionChannel,
  primeAgentCreateGitWorktreeChannel,
  primeAgentGitBranchesChannel,
  primeAgentGitWorkspaceChannel,
  primeAgentInitializeGitChannel,
  primeAgentDeleteGitBranchChannel,
  primeAgentImportSessionChannel,
  primeAgentModelsChannel,
  primeAgentSavedSessionsChannel,
  primeAgentSessionViewChannel,
  primeAgentSkillsChannel,
  primeAgentRlmDepthChannel,
  primeAgentRenameGitBranchChannel,
  primeAgentRenameSessionChannel,
  primeAgentRefineSessionChannel,
  primeAgentSetModelChannel,
  primeAgentSetRlmDepthChannel,
  primeAgentSubmitTaskChannel,
  primeAgentSwitchGitBranchChannel,
  primeAgentWorkspaceChannel,
  rendererReadyChannel,
  revealWorkspacePathChannel,
} from './renderer-api.js';

const rendererReadyTimeoutMs = 5_000;
const developmentRendererUrlEnvironmentName = 'ERNIE_RENDERER_URL';

app.setName('Ernie');

function installMacApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Ernie',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { label: 'File', submenu: [{ role: 'close' }] },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

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
  const daemon = createPrimeAgentDaemon({
    currentCwd: process.cwd(),
    daemonEntrypointPath: path.join(
      import.meta.dirname,
      'packages/prime-agent-daemon/daemon-runner.js',
    ),
    executablePath: process.execPath,
    sessionNameExtensionPath: path.join(
      import.meta.dirname,
      'packages/session-name-hook/index.js',
    ),
  });

  ipcMain.handle(primeAgentWorkspaceChannel, () =>
    Effect.runPromise(daemon.listWorkspace()),
  );
  ipcMain.handle(primeAgentCreateSessionChannel, (_event, creation: JsonValue) =>
    Effect.runPromise(daemon.createSession(creation)),
  );
  ipcMain.handle(primeAgentSavedSessionsChannel, () =>
    Effect.runPromise(daemon.listSavedSessions()),
  );
  ipcMain.handle(
    primeAgentImportSessionChannel,
    (_event, sessionPath: JsonValue) =>
      Effect.runPromise(daemon.importSession(sessionPath)),
  );
  ipcMain.handle(primeAgentRenameSessionChannel, (_event, rename: JsonValue) =>
    Effect.runPromise(daemon.renameSession(rename)),
  );
  ipcMain.handle(
    primeAgentModelsChannel,
    (_event, activeSessionId: JsonValue) =>
      Effect.runPromise(daemon.listModels(activeSessionId)),
  );
  ipcMain.handle(
    primeAgentSkillsChannel,
    (_event, activeSessionId: JsonValue) =>
      Effect.runPromise(daemon.listSkills(activeSessionId)),
  );
  ipcMain.handle(
    primeAgentSessionViewChannel,
    (_event, activeSessionId: JsonValue) =>
      Effect.runPromise(daemon.getSessionView(activeSessionId)),
  );
  ipcMain.handle(primeAgentSetModelChannel, (_event, selection: JsonValue) =>
    Effect.runPromise(daemon.setModel(selection)),
  );
  ipcMain.handle(
    primeAgentRlmDepthChannel,
    (_event, activeSessionId: JsonValue) =>
      Effect.runPromise(daemon.getRlmDepth(activeSessionId)),
  );
  ipcMain.handle(primeAgentSetRlmDepthChannel, (_event, selection: JsonValue) =>
    Effect.runPromise(daemon.setRlmDepth(selection)),
  );
  ipcMain.handle(primeAgentSubmitTaskChannel, (_event, submission: JsonValue) =>
    Effect.runPromise(daemon.submitTask(submission)),
  );
  ipcMain.handle(primeAgentRefineSessionChannel, (_event, request: JsonValue) =>
    Effect.runPromise(daemon.refineSession(request)),
  );
  ipcMain.handle(primeAgentGitBranchesChannel, (_event, cwd: JsonValue) =>
    Effect.runPromise(readLocalGitBranches(cwd)),
  );
  ipcMain.handle(primeAgentGitWorkspaceChannel, (_event, cwd: JsonValue) =>
    Effect.runPromise(readLocalGitWorkspace(cwd)),
  );
  ipcMain.handle(
    primeAgentSwitchGitBranchChannel,
    (_event, selection: JsonValue) =>
      Effect.runPromise(switchLocalGitBranch(selection)),
  );
  ipcMain.handle(
    primeAgentDeleteGitBranchChannel,
    (_event, selection: JsonValue) =>
      Effect.runPromise(deleteLocalGitBranch(selection)),
  );
  ipcMain.handle(
    primeAgentRenameGitBranchChannel,
    (_event, rename: JsonValue) =>
      Effect.runPromise(renameLocalGitBranch(rename)),
  );
  ipcMain.handle(primeAgentInitializeGitChannel, (_event, cwd: JsonValue) =>
    Effect.runPromise(initializeLocalGitRepository(cwd)),
  );
  ipcMain.handle(
    primeAgentCreateGitWorktreeChannel,
    (_event, creation: JsonValue) =>
      Effect.runPromise(createLocalGitWorktree(creation)),
  );
  ipcMain.handle(chooseWorkspaceDirectoryChannel, () => {
    const options: OpenDialogOptions = {
      buttonLabel: 'Choose',
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose workspace directory',
    };
    return Effect.runPromise(
      Effect.tryPromise(() =>
        mainWindow === null
          ? dialog.showOpenDialog(options)
          : dialog.showOpenDialog(mainWindow, options),
      ).pipe(
        Effect.map((result) =>
          result.canceled ? null : (result.filePaths[0] ?? null),
        ),
      ),
    );
  });
  ipcMain.handle(revealWorkspacePathChannel, (_event, workspacePath: JsonValue) => {
    if (!isJsonString(workspacePath) || workspacePath.trim().length === 0) {
      return false;
    }
    shell.showItemInFolder(workspacePath);
    return true;
  });
  app.once('will-quit', () => daemon.close());
}

function waitForRendererReady(
  window: BrowserWindow,
): Effect.Effect<void, RendererReadyTimeoutError | WindowClosedBeforeReadyError> {
  return Effect.callback((resume) => {
    let settled = false;

    const cleanup = (): void => {
      clearTimeout(timeoutId);
      ipcMain.off(rendererReadyChannel, onRendererReady);
      window.off('closed', onWindowClosed);
    };

    const finish = (
      result: Effect.Effect<
        void,
        RendererReadyTimeoutError | WindowClosedBeforeReadyError
      >,
    ): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resume(result);
    };

    const onRendererReady = (event: IpcMainEvent): void => {
      if (event.sender !== window.webContents) {
        return;
      }

      finish(Effect.void);
    };

    const onWindowClosed = (): void => {
      finish(Effect.fail(new WindowClosedBeforeReadyError()));
    };

    const timeoutId = setTimeout(() => {
      finish(Effect.fail(new RendererReadyTimeoutError()));
    }, rendererReadyTimeoutMs);

    ipcMain.on(rendererReadyChannel, onRendererReady);
    window.once('closed', onWindowClosed);

    return Effect.sync(cleanup);
  });
}

function waitForReadyToShow(
  window: BrowserWindow,
): Effect.Effect<void, WindowClosedBeforeReadyError> {
  return Effect.callback((resume) => {
    const cleanup = (): void => {
      window.off('ready-to-show', onReadyToShow);
      window.off('closed', onWindowClosed);
    };

    const onReadyToShow = (): void => {
      cleanup();
      resume(Effect.void);
    };

    const onWindowClosed = (): void => {
      cleanup();
      resume(Effect.fail(new WindowClosedBeforeReadyError()));
    };

    window.once('ready-to-show', onReadyToShow);
    window.once('closed', onWindowClosed);

    return Effect.sync(cleanup);
  });
}

const createWindow = Effect.fn('Ernie.createWindow')(function* () {
  const developmentRendererUrl = readDevelopmentRendererUrl();
  const iconPath = path.join(import.meta.dirname, '../renderer/ernie-logo.png');
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
      preload: path.join(import.meta.dirname, 'preload.cjs'),
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

  const loadRenderer = Effect.tryPromise(() =>
    developmentRendererUrl === null
      ? window.loadFile(path.join(import.meta.dirname, '../renderer/index.html'))
      : window.loadURL(developmentRendererUrl.href),
  );

  yield* Effect.all([loadRenderer, readyToShow, rendererReady], {
    concurrency: 'unbounded',
    discard: true,
  }).pipe(
    Effect.onError(() =>
      Effect.sync(() => {
        if (!window.isDestroyed()) window.destroy();
      }),
    ),
  );

  window.show();
  return window;
});

function reportStartupFailure(cause: unknown): void {
  console.error('Ernie could not open its main window.', cause);
  app.quit();
}

const startApplication = Effect.fn('Ernie.startApplication')(function* () {
  yield* Effect.tryPromise(() => app.whenReady());
  registerPrimeAgentHandlers();

  if (process.platform === 'darwin' && app.dock !== undefined) {
    installMacApplicationMenu();
    app.dock.setIcon(
      path.join(import.meta.dirname, '../renderer/ernie-logo.png'),
    );
  }

  yield* createWindow();

  app.on('activate', () => {
    if (mainWindow === null || mainWindow.isDestroyed()) {
      Effect.runFork(
        createWindow().pipe(
          Effect.catch((error) =>
            Effect.sync(() => reportStartupFailure(error)),
          ),
        ),
      );
      return;
    }

    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

Effect.runFork(
  startApplication().pipe(
    Effect.catch((error) => Effect.sync(() => reportStartupFailure(error))),
  ),
);
