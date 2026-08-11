import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { IpcMainEvent, OpenDialogOptions } from 'electron';
import { Effect } from 'effect';

import {
  createLocalGitWorktree,
  deleteLocalGitBranch,
  initializeLocalGitRepository,
  readLocalGitBranches,
  renameLocalGitBranch,
  switchLocalGitBranch,
} from './packages/prime-agent-daemon/git-server';
import { createPrimeAgentDaemon } from './packages/prime-agent-daemon/server';
import {
  chooseWorkspaceDirectoryChannel,
  primeAgentCreateSessionChannel,
  primeAgentCreateGitWorktreeChannel,
  primeAgentGitBranchesChannel,
  primeAgentInitializeGitChannel,
  primeAgentDeleteGitBranchChannel,
  primeAgentModelsChannel,
  primeAgentSkillsChannel,
  primeAgentRlmDepthChannel,
  primeAgentRenameGitBranchChannel,
  primeAgentSetModelChannel,
  primeAgentSetRlmDepthChannel,
  primeAgentSubmitTaskChannel,
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
  const daemon = createPrimeAgentDaemon({
    currentCwd: process.cwd(),
    daemonEntrypointPath: path.join(
      __dirname,
      'packages/prime-agent-daemon/daemon-runner.js',
    ),
    executablePath: process.execPath,
  });

  ipcMain.handle(primeAgentWorkspaceChannel, () =>
    Effect.runPromise(daemon.listWorkspace()),
  );
  ipcMain.handle(primeAgentCreateSessionChannel, (_event, cwd: unknown) =>
    Effect.runPromise(daemon.createSession(cwd)),
  );
  ipcMain.handle(
    primeAgentModelsChannel,
    (_event, activeSessionId: unknown) =>
      Effect.runPromise(daemon.listModels(activeSessionId)),
  );
  ipcMain.handle(
    primeAgentSkillsChannel,
    (_event, activeSessionId: unknown) =>
      Effect.runPromise(daemon.listSkills(activeSessionId)),
  );
  ipcMain.handle(primeAgentSetModelChannel, (_event, selection: unknown) =>
    Effect.runPromise(daemon.setModel(selection)),
  );
  ipcMain.handle(
    primeAgentRlmDepthChannel,
    (_event, activeSessionId: unknown) =>
      Effect.runPromise(daemon.getRlmDepth(activeSessionId)),
  );
  ipcMain.handle(primeAgentSetRlmDepthChannel, (_event, selection: unknown) =>
    Effect.runPromise(daemon.setRlmDepth(selection)),
  );
  ipcMain.handle(primeAgentSubmitTaskChannel, (_event, submission: unknown) =>
    Effect.runPromise(daemon.submitTask(submission)),
  );
  ipcMain.handle(primeAgentGitBranchesChannel, (_event, cwd: unknown) =>
    Effect.runPromise(readLocalGitBranches(cwd)),
  );
  ipcMain.handle(
    primeAgentSwitchGitBranchChannel,
    (_event, selection: unknown) =>
      Effect.runPromise(switchLocalGitBranch(selection)),
  );
  ipcMain.handle(
    primeAgentDeleteGitBranchChannel,
    (_event, selection: unknown) =>
      Effect.runPromise(deleteLocalGitBranch(selection)),
  );
  ipcMain.handle(
    primeAgentRenameGitBranchChannel,
    (_event, rename: unknown) =>
      Effect.runPromise(renameLocalGitBranch(rename)),
  );
  ipcMain.handle(primeAgentInitializeGitChannel, (_event, cwd: unknown) =>
    Effect.runPromise(initializeLocalGitRepository(cwd)),
  );
  ipcMain.handle(
    primeAgentCreateGitWorktreeChannel,
    (_event, creation: unknown) =>
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
  app.once('will-quit', () => daemon.close());
}

function waitForRendererReady(
  window: BrowserWindow,
): Effect.Effect<void, RendererReadyTimeoutError | WindowClosedBeforeReadyError> {
  return Effect.async((resume) => {
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
  return Effect.async((resume) => {
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

  const loadRenderer = Effect.tryPromise(() =>
    developmentRendererUrl === null
      ? window.loadFile(path.join(__dirname, '../renderer/index.html'))
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

function reportStartupFailure(error: unknown): void {
  console.error('Ernie could not open its main window.', error);
  app.quit();
}

const startApplication = Effect.fn('Ernie.startApplication')(function* () {
  yield* Effect.tryPromise(() => app.whenReady());
  registerPrimeAgentHandlers();

  if (process.platform === 'darwin' && app.dock !== undefined) {
    app.dock.setIcon(path.join(__dirname, '../renderer/ernie-logo.png'));
  }

  yield* createWindow();

  app.on('activate', () => {
    if (mainWindow === null || mainWindow.isDestroyed()) {
      Effect.runFork(
        createWindow().pipe(
          Effect.catchAll((error) =>
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
    Effect.catchAll((error) => Effect.sync(() => reportStartupFailure(error))),
  ),
);
