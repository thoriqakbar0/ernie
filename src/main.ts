import path from 'node:path';

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import type {
  IpcMainEvent,
  MenuItemConstructorOptions,
  OpenDialogOptions,
} from 'electron';
import { Effect, Fiber, Stream } from 'effect';
import {
  registerBrowserPluginMain,
  type BrowserPluginMainController,
} from './packages/browser-plugin/main.js';
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
import { createErnieDaemon } from './packages/ernie-daemon/index.js';
import { createSelectedFeedRegistry } from './packages/ernie-daemon/selected-feed.js';
import {
  startErnieUiControlServer,
  type ErnieUiControlCapabilityAvailability,
  type ErnieUiControlCommand,
  type ErnieUiControlCommandResult,
} from './packages/ernie-ui-control/index.js';
import { ernieUiControlSocketFlagName } from './packages/ernie-agent-interaction/index.js';
import {
  coalescePrimeAgentSessionFeedItems,
  parsePrimeAgentSessionFeedRequest,
  parsePrimeAgentSessionFeedStop,
} from './packages/prime-agent-daemon/events.js';
import type { PrimeAgentSessionFeedEnvelope } from './packages/prime-agent-daemon/types.js';
import {
  agentHarnessChannel,
  chooseWorkspaceDirectoryChannel,
  colorThemeRequestChannel,
  primeAgentCreateSessionChannel,
  primeAgentCreateGitWorktreeChannel,
  primeAgentGitBranchesChannel,
  primeAgentGitWorkspaceChannel,
  primeAgentInitializeGitChannel,
  primeAgentDeleteGitBranchChannel,
  primeAgentImportSessionChannel,
  primeAgentModelsChannel,
  primeAgentSavedSessionsChannel,
  primeAgentSessionFeedEventChannel,
  primeAgentSessionFeedStartChannel,
  primeAgentSessionFeedStopChannel,
  primeAgentSessionHistoryChannel,
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
  primeAgentWorkspaceFeedEventChannel,
  primeAgentWorkspaceFeedStartChannel,
  primeAgentWorkspaceFeedStopChannel,
  rendererReadyChannel,
  sidebarControlRequestChannel,
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

function registerErnieDaemonHandlers(agentUiControlSocketPath: string): void {
  const daemon = createErnieDaemon({
    harness: createPrimeAgentDaemon({
      currentCwd: process.cwd(),
      daemonEntrypointPath: path.join(
        import.meta.dirname,
        'packages/prime-agent-daemon/daemon-runner.js',
      ),
      executablePath: process.execPath,
      extensionFlagValues: {
        [ernieUiControlSocketFlagName]: agentUiControlSocketPath,
      },
      extensionPaths: [
        path.join(
          import.meta.dirname,
          'packages/session-name-hook/index.js',
        ),
        path.join(
          import.meta.dirname,
          'packages/ernie-agent-interaction/index.js',
        ),
      ],
      socketPath: path.join(app.getPath('userData'), 'prime-agent.sock'),
    }),
  });
  interface OwnedFeed {
    fiber: Fiber.Fiber<void> | null;
    readonly senderId: number;
  }
  const selectedSessionFeeds = createSelectedFeedRegistry<Fiber.Fiber<void>>();
  const workspaceFeeds = new Map<string, OwnedFeed>();
  const observedSenders = new Set<number>();
  const feedKey = (senderId: number, subscriptionId: string): string =>
    `${senderId}:${subscriptionId}`;
  const interruptFeed = (fiber: Fiber.Fiber<void> | null): void => {
    if (fiber !== null) Effect.runFork(Fiber.interrupt(fiber));
  };
  const stopSenderFeeds = (senderId: number): void => {
    interruptFeed(selectedSessionFeeds.stopSender(senderId));
    for (const [key, owned] of workspaceFeeds) {
      if (owned.senderId !== senderId) continue;
      workspaceFeeds.delete(key);
      interruptFeed(owned.fiber);
    }
    observedSenders.delete(senderId);
  };

  const observeSender = (senderId: number, event: IpcMainEvent): void => {
    if (observedSenders.has(senderId)) return;
    observedSenders.add(senderId);
    event.sender.once('destroyed', () => stopSenderFeeds(senderId));
  };

  ipcMain.on(
    primeAgentWorkspaceFeedStartChannel,
    (event, subscriptionId: JsonValue) => {
      const parsed = parsePrimeAgentSessionFeedStop(subscriptionId);
      if (!parsed.ok) return;
      const senderId = event.sender.id;
      const key = feedKey(senderId, parsed.value);
      const previous = workspaceFeeds.get(key);
      if (previous?.fiber !== null && previous?.fiber !== undefined) {
        Effect.runFork(Fiber.interrupt(previous.fiber));
      }
      observeSender(senderId, event);
      const owned: OwnedFeed = { fiber: null, senderId };
      workspaceFeeds.set(key, owned);
      owned.fiber = Effect.runFork(
        daemon.workspaceFeed().pipe(
          Stream.runForEach((item) =>
            Effect.sync(() => {
              if (
                workspaceFeeds.get(key) !== owned ||
                event.sender.isDestroyed()
              ) {
                return;
              }
              event.sender.send(
                primeAgentWorkspaceFeedEventChannel,
                parsed.value,
                item,
              );
            }),
          ),
          Effect.ensuring(
            Effect.sync(() => {
              if (workspaceFeeds.get(key) === owned) workspaceFeeds.delete(key);
            }),
          ),
        ),
      );
    },
  );
  ipcMain.on(
    primeAgentWorkspaceFeedStopChannel,
    (event, subscriptionId: JsonValue) => {
      const parsed = parsePrimeAgentSessionFeedStop(subscriptionId);
      if (!parsed.ok) return;
      const key = feedKey(event.sender.id, parsed.value);
      const owned = workspaceFeeds.get(key);
      workspaceFeeds.delete(key);
      if (owned?.fiber !== null && owned?.fiber !== undefined) {
        Effect.runFork(Fiber.interrupt(owned.fiber));
      }
    },
  );

  ipcMain.on(
    primeAgentSessionFeedStartChannel,
    (event, request: JsonValue) => {
      const parsed = parsePrimeAgentSessionFeedRequest(request);
      if (!parsed.ok) return;

      const senderId = event.sender.id;
      const { activeSessionId, subscriptionId } = parsed.value;
      observeSender(senderId, event);
      const { owner, replaced } = selectedSessionFeeds.replace(
        senderId,
        subscriptionId,
      );
      interruptFeed(replaced);

      let revision = 0;
      const run = daemon.sessionFeed(activeSessionId).pipe(
        Stream.groupedWithin(64, '16 millis'),
        Stream.flatMap((items) =>
          Stream.fromArray(coalescePrimeAgentSessionFeedItems(items)),
        ),
        Stream.runForEach((item) =>
          Effect.sync(() => {
            if (
              !selectedSessionFeeds.isCurrent(owner) ||
              event.sender.isDestroyed()
            ) {
              return;
            }
            const envelope: PrimeAgentSessionFeedEnvelope = {
              activeSessionId,
              item,
              revision,
              subscriptionId,
            };
            revision += 1;
            event.sender.send(
              primeAgentSessionFeedEventChannel,
              subscriptionId,
              envelope,
            );
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            selectedSessionFeeds.stop(senderId, subscriptionId);
          }),
        ),
      );
      const fiber = Effect.runFork(run);
      if (!selectedSessionFeeds.attach(owner, fiber)) interruptFeed(fiber);
    },
  );
  ipcMain.on(
    primeAgentSessionFeedStopChannel,
    (event, subscriptionId: JsonValue) => {
      const parsed = parsePrimeAgentSessionFeedStop(subscriptionId);
      if (!parsed.ok) return;
      interruptFeed(
        selectedSessionFeeds.stop(event.sender.id, parsed.value),
      );
    },
  );

  ipcMain.handle(primeAgentWorkspaceChannel, () =>
    Effect.runPromise(daemon.listWorkspace()),
  );
  ipcMain.handle(agentHarnessChannel, () => daemon.harness);
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
    primeAgentSessionHistoryChannel,
    (_event, request: JsonValue) =>
      Effect.runPromise(daemon.loadSessionHistory(request)),
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
  app.once('will-quit', () => {
    for (const senderId of observedSenders) stopSenderFeeds(senderId);
    daemon.close();
  });
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

const createWindow = Effect.fn('Ernie.createWindow')(function* (
  browserPlugin: BrowserPluginMainController,
) {
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
    title: '+ electron',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      sandbox: true,
    },
  });

  mainWindow = window;
  browserPlugin.attachWindow(window);
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

function reportUiControlFailure(message: string, cause?: unknown): void {
  if (cause instanceof Error) {
    console.error(message, { name: cause.name });
    return;
  }
  console.error(message);
}

function readUiControlAvailability(
  capabilityId: string,
): ErnieUiControlCapabilityAvailability {
  return {
    status:
      capabilityId !== 'discovery' &&
      (mainWindow === null || mainWindow.isDestroyed())
        ? 'unavailable'
        : 'available',
  };
}

function handleUiControl(
  command: ErnieUiControlCommand,
): ErnieUiControlCommandResult {
  const window = mainWindow;
  if (window === null || window.isDestroyed()) {
    return {
      error: { code: 'ui_unavailable', message: 'Ernie has no open window.' },
      ok: false,
      version: 1,
    };
  }

  switch (command.type) {
    case 'focus': {
      if (window.isMinimized()) window.restore();
      window.show();
      if (process.platform === 'darwin') app.focus({ steal: true });
      window.focus();
      return { ok: true, version: 1 };
    }
    case 'set-theme':
      window.webContents.send(colorThemeRequestChannel, command.theme);
      return { ok: true, version: 1 };
    case 'set-sidebar-open':
    case 'set-sidebar-width':
      window.webContents.send(sidebarControlRequestChannel, command);
      return { ok: true, version: 1 };
  }
}

const startApplication = Effect.fn('Ernie.startApplication')(function* () {
  yield* Effect.tryPromise(() => app.whenReady());
  const agentUiControlSocketPath = path.join(
    app.getPath('userData'),
    `ui-agent-control-${process.pid}.sock`,
  );
  registerErnieDaemonHandlers(agentUiControlSocketPath);
  const browserPlugin = registerBrowserPluginMain();
  app.once('will-quit', () => browserPlugin.dispose());

  if (process.platform === 'darwin' && app.dock !== undefined) {
    installMacApplicationMenu();
    app.dock.setIcon(
      path.join(import.meta.dirname, '../renderer/ernie-logo.png'),
    );
  }

  yield* createWindow(browserPlugin);
  const agentUiControl = yield* Effect.promise(() =>
    startErnieUiControlServer(
      agentUiControlSocketPath,
      handleUiControl,
      reportUiControlFailure,
      readUiControlAvailability,
    ),
  );
  const cliUiControl = yield* Effect.promise(() =>
    startErnieUiControlServer(
      path.join(app.getPath('userData'), 'ui-control.sock'),
      handleUiControl,
      reportUiControlFailure,
      readUiControlAvailability,
    ),
  );
  for (const uiControl of [agentUiControl, cliUiControl]) {
    if (!uiControl.ok) {
      console.error(uiControl.error.message);
      continue;
    }
    app.once('will-quit', () => {
      Effect.runFork(Effect.promise(() => uiControl.value.close()));
    });
  }

  app.on('activate', () => {
    if (mainWindow === null || mainWindow.isDestroyed()) {
      Effect.runFork(
        createWindow(browserPlugin).pipe(
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
