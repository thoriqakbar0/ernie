import path from 'node:path';

import { app, BrowserWindow, ipcMain } from 'electron';
import { Effect, Fiber } from 'effect';

import {
  primeAgentModelsChannel,
  primeAgentRlmDepthChannel,
  primeAgentSetModelChannel,
  primeAgentSetRlmDepthChannel,
  primeAgentWorkspaceChannel,
  rendererReadyChannel,
} from '../../.build/main/renderer-api.js';

const rendererReadyTimeoutMs = 5_000;
const settingsButtonSelector = 'button[aria-label="Application settings"]';
const sidebarRailSelector = '[data-sidebar="rail"]';
const workspaceFolderTriggerSelector = '#workspace-folder';
const workspaceSearchSelector =
  'input[aria-label="Search workspace directories"]';
const newDirectorySelector = 'button[aria-label="New directory"]';

function waitForRendererReady(window, startedAt) {
  return Effect.callback((resume) => {
    const cleanup = () => {
      clearTimeout(timeoutId);
      ipcMain.off(rendererReadyChannel, onReady);
      window.off('closed', onClosed);
    };

    const onReady = (event) => {
      if (event.sender !== window.webContents) return;
      cleanup();
      resume(Effect.succeed(Math.round(performance.now() - startedAt)));
    };

    const onClosed = () => {
      cleanup();
      resume(Effect.fail(new Error('Window closed before renderer readiness.')));
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      resume(Effect.fail(new Error('Renderer readiness timed out.')));
    }, rendererReadyTimeoutMs);

    ipcMain.on(rendererReadyChannel, onReady);
    window.once('closed', onClosed);

    return Effect.sync(cleanup);
  });
}

function waitForEvent(emitter, eventName) {
  return Effect.callback((resume) => {
    const onEvent = (...args) => {
      emitter.off(eventName, onEvent);
      resume(Effect.succeed(args));
    };
    emitter.once(eventName, onEvent);
    return Effect.sync(() => emitter.off(eventName, onEvent));
  });
}

function executeJavaScript(window, source) {
  return Effect.tryPromise(() => window.webContents.executeJavaScript(source));
}

const checkAgentation = Effect.fn('Agentation.check')(function* () {
  ipcMain.handle(primeAgentWorkspaceChannel, () => ({
    ok: true,
    value: { currentCwd: process.cwd(), sessions: [] },
  }));
  ipcMain.handle(primeAgentModelsChannel, () => ({ ok: true, value: [] }));
  ipcMain.handle(primeAgentSetModelChannel, () => ({
    ok: false,
    error: { code: 'invalid_request', message: 'No test session selected.' },
  }));
  ipcMain.handle(primeAgentRlmDepthChannel, () => ({
    ok: true,
    value: { maxDepth: 1, source: 'default' },
  }));
  ipcMain.handle(primeAgentSetRlmDepthChannel, () => ({
    ok: false,
    error: { code: 'invalid_request', message: 'No test session selected.' },
  }));

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.resolve('.build/main/preload.cjs'),
      sandbox: true,
    },
  });
  return yield* Effect.gen(function* () {
    const startedAt = performance.now();
    const rendererReady = waitForRendererReady(window, startedAt);
    const readyToShow = waitForEvent(window, 'ready-to-show');
    const rendererReadyFiber = yield* Effect.forkChild(rendererReady);
    const readyToShowFiber = yield* Effect.forkChild(readyToShow);
    yield* Effect.tryPromise(() =>
      window.loadFile(path.resolve('.build/renderer/index.html')),
    );
    const loadMs = Math.round(performance.now() - startedAt);
    const [readyMs] = yield* Effect.all([
      Fiber.join(rendererReadyFiber),
      Fiber.join(readyToShowFiber),
    ]);
    const revealReadyMs = Math.round(performance.now() - startedAt);

    const settingsButtonExists = yield* executeJavaScript(window, `(() => {
      const settingsButton = document.querySelector(${JSON.stringify(settingsButtonSelector)});
      return settingsButton instanceof HTMLButtonElement;
    })()`);

    if (!settingsButtonExists) {
      process.stdout.write(`${JSON.stringify({ settingsButtonExists })}\n`);
      return 1;
    }

    const reloadStartedAt = performance.now();
    const reloaded = waitForEvent(window.webContents, 'did-finish-load');
    const reloadReady = waitForRendererReady(window, reloadStartedAt);
    const reloadedFiber = yield* Effect.forkChild(reloaded);
    const reloadReadyFiber = yield* Effect.forkChild(reloadReady);
    yield* executeJavaScript(window, `(() => {
      const settingsButton = document.querySelector(${JSON.stringify(settingsButtonSelector)});
      if (!(settingsButton instanceof HTMLButtonElement)) return false;
      settingsButton.click();
      return true;
    })()`);
    yield* Effect.sleep(50);
    yield* executeJavaScript(window, `(() => {
      const reloadAction = [...document.querySelectorAll('[role="menuitem"]')]
        .find((item) => item.textContent?.trim() === 'Reload renderer');
      if (!(reloadAction instanceof HTMLElement)) return false;
      reloadAction.click();
      return true;
    })()`);
    const [, reloadReadyMs] = yield* Effect.all([
      Fiber.join(reloadedFiber),
      Fiber.join(reloadReadyFiber),
    ]);
    const reloadMs = Math.round(performance.now() - reloadStartedAt);

    const workspacePickerOpened = yield* executeJavaScript(window, `(() => {
      const trigger = document.querySelector(${JSON.stringify(workspaceFolderTriggerSelector)});
      if (!(trigger instanceof HTMLButtonElement)) return false;
      trigger.click();
      return true;
    })()`);
    yield* Effect.sleep(50);
    const workspacePicker = yield* executeJavaScript(window, `(() => {
      const search = document.querySelector(${JSON.stringify(workspaceSearchSelector)});
      const list = document.querySelector('[role="listbox"]');
      const newDirectory = document.querySelector(${JSON.stringify(newDirectorySelector)});
      if (!(list instanceof HTMLElement)) {
        return {
          apiExists: typeof window.ernie.chooseWorkspaceDirectory === 'function',
          searchExists: search instanceof HTMLInputElement,
          scrollContained: false,
          newDirectoryExists: newDirectory instanceof HTMLButtonElement,
        };
      }
      const style = getComputedStyle(list);
      return {
        apiExists: typeof window.ernie.chooseWorkspaceDirectory === 'function',
        searchExists: search instanceof HTMLInputElement,
        scrollContained:
          style.maxHeight !== 'none' &&
          (style.overflowY === 'auto' || style.overflowY === 'scroll'),
        newDirectoryExists: newDirectory instanceof HTMLButtonElement,
      };
    })()`);
    const workspacePickerReady =
      workspacePickerOpened &&
      workspacePicker.apiExists &&
      workspacePicker.searchExists &&
      workspacePicker.scrollContained &&
      workspacePicker.newDirectoryExists;

    if (!workspacePickerReady) {
      process.stdout.write(
        `${JSON.stringify({ workspacePickerOpened, ...workspacePicker })}\n`,
      );
      return 1;
    }

    const sidebarBeforeResize = yield* executeJavaScript(window, `(() => {
      const rail = document.querySelector(${JSON.stringify(sidebarRailSelector)});
      const sidebar = document.querySelector('[data-slot="sidebar"]');
      const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]');
      if (!(rail instanceof HTMLElement) || !(wrapper instanceof HTMLElement)) {
        return null;
      }

      const bounds = rail.getBoundingClientRect();
      return {
        x: Math.round(bounds.left + bounds.width / 2),
        y: Math.round(bounds.top + bounds.height / 2),
        state: sidebar instanceof HTMLElement ? sidebar.dataset.state : null,
        width: Number.parseFloat(
          getComputedStyle(wrapper).getPropertyValue('--sidebar-width'),
        ),
      };
    })()`);

    if (sidebarBeforeResize === null) {
      process.stdout.write(`${JSON.stringify({ sidebarResizable: false })}\n`);
      return 1;
    }

    window.webContents.focus();
    window.webContents.sendInputEvent({
      type: 'mouseMove',
      x: sidebarBeforeResize.x,
      y: sidebarBeforeResize.y,
    });
    window.webContents.sendInputEvent({
      type: 'mouseDown',
      x: sidebarBeforeResize.x,
      y: sidebarBeforeResize.y,
      button: 'left',
      clickCount: 1,
    });
    window.webContents.sendInputEvent({
      type: 'mouseMove',
      x: sidebarBeforeResize.x + 48,
      y: sidebarBeforeResize.y,
      button: 'left',
    });
    window.webContents.sendInputEvent({
      type: 'mouseUp',
      x: sidebarBeforeResize.x + 48,
      y: sidebarBeforeResize.y,
      button: 'left',
      clickCount: 1,
    });
    yield* Effect.sleep(100);

    const sidebarAfterResize = yield* executeJavaScript(window, `(() => {
      const sidebar = document.querySelector('[data-slot="sidebar"]');
      const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]');
      if (!(wrapper instanceof HTMLElement)) return null;
      return {
        state: sidebar instanceof HTMLElement ? sidebar.dataset.state : null,
        width: Number.parseFloat(
          getComputedStyle(wrapper).getPropertyValue('--sidebar-width'),
        ),
      };
    })()`);
    const sidebarResizable =
      sidebarAfterResize !== null &&
      sidebarAfterResize.state === 'expanded' &&
      sidebarAfterResize.width >= sidebarBeforeResize.width + 40;

    const state = yield* executeJavaScript(window, `(() => {
      const toolbar = document.querySelector('[data-agentation-toolbar]');
      if (!(toolbar instanceof HTMLElement)) {
        return { toolbarExists: false, toolbarVisible: false };
      }

      const bounds = toolbar.getBoundingClientRect();
      const style = getComputedStyle(toolbar);
      return {
        toolbarExists: true,
        toolbarVisible:
          bounds.width > 0 &&
          bounds.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0,
        bounds: {
          width: bounds.width,
          height: bounds.height,
        },
      };
    })()`);

    process.stdout.write(
      `${JSON.stringify({
        ...state,
        settingsButtonExists,
        sidebarResizable,
        sidebarWidthBefore: sidebarBeforeResize.width,
        sidebarWidthAfter: sidebarAfterResize?.width ?? null,
        loadMs,
        readyMs,
        revealReadyMs,
        reloadMs,
        reloadReadyMs,
        workspacePickerReady,
      })}\n`,
    );
    return state.toolbarVisible && sidebarResizable && workspacePickerReady
      ? 0
      : 1;
  }).pipe(Effect.ensuring(Effect.sync(() => window.destroy())));
});

void app.whenReady().then(() => {
  void Effect.runPromise(
    checkAgentation().pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          process.stderr.write(`${String(error)}\n`);
          return 2;
        }),
      ),
    ),
  ).then((exitCode) => app.exit(exitCode));
});
