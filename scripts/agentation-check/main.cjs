const { once } = require('node:events');
const path = require('node:path');

const { app, BrowserWindow, ipcMain } = require('electron');
const {
  primeAgentModelsChannel,
  primeAgentRlmDepthChannel,
  primeAgentSetModelChannel,
  primeAgentSetRlmDepthChannel,
  primeAgentWorkspaceChannel,
  rendererReadyChannel,
} = require(path.resolve('.build/main/renderer-api.js'));

const rendererReadyTimeoutMs = 5_000;
const reloadButtonSelector = 'button[aria-label="Reload renderer"]';
const sidebarRailSelector = '[data-sidebar="rail"]';
const workspaceFolderTriggerSelector = '#workspace-folder';
const workspaceSearchSelector =
  'input[aria-label="Search workspace directories"]';
const newDirectorySelector = 'button[aria-label="New directory"]';

function waitForRendererReady(window, startedAt) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeoutId);
      ipcMain.off(rendererReadyChannel, onReady);
      window.off('closed', onClosed);
    };

    const onReady = (event) => {
      if (event.sender !== window.webContents) return;
      cleanup();
      resolve(Math.round(performance.now() - startedAt));
    };

    const onClosed = () => {
      cleanup();
      reject(new Error('Window closed before renderer readiness.'));
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Renderer readiness timed out.'));
    }, rendererReadyTimeoutMs);

    ipcMain.on(rendererReadyChannel, onReady);
    window.once('closed', onClosed);
  });
}

async function checkAgentation() {
  await app.whenReady();

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
      preload: path.resolve('.build/main/preload.js'),
      sandbox: true,
    },
  });
  try {
    const startedAt = performance.now();
    const rendererReady = waitForRendererReady(window, startedAt);
    const readyToShow = once(window, 'ready-to-show');
    await window.loadFile(path.resolve('.build/renderer/index.html'));
    const loadMs = Math.round(performance.now() - startedAt);
    const readyMs = await rendererReady;
    await readyToShow;
    const revealReadyMs = Math.round(performance.now() - startedAt);

    const reloadButtonExists = await window.webContents.executeJavaScript(`(() => {
      const reloadButton = document.querySelector(${JSON.stringify(reloadButtonSelector)});
      return reloadButton instanceof HTMLButtonElement;
    })()`);

    if (!reloadButtonExists) {
      process.stdout.write(`${JSON.stringify({ reloadButtonExists })}\n`);
      app.exit(1);
      return;
    }

    const reloadStartedAt = performance.now();
    const reloaded = once(window.webContents, 'did-finish-load');
    const reloadReady = waitForRendererReady(window, reloadStartedAt);
    await window.webContents.executeJavaScript(`(() => {
      const reloadButton = document.querySelector(${JSON.stringify(reloadButtonSelector)});
      if (!(reloadButton instanceof HTMLButtonElement)) return false;
      reloadButton.click();
      return true;
    })()`);
    const [, reloadReadyMs] = await Promise.all([reloaded, reloadReady]);
    const reloadMs = Math.round(performance.now() - reloadStartedAt);

    const workspacePickerOpened = await window.webContents.executeJavaScript(`(() => {
      const trigger = document.querySelector(${JSON.stringify(workspaceFolderTriggerSelector)});
      if (!(trigger instanceof HTMLButtonElement)) return false;
      trigger.click();
      return true;
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const workspacePicker = await window.webContents.executeJavaScript(`(() => {
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
      app.exit(1);
      return;
    }

    const sidebarBeforeResize = await window.webContents.executeJavaScript(`(() => {
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
      app.exit(1);
      return;
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
    await new Promise((resolve) => setTimeout(resolve, 100));

    const sidebarAfterResize = await window.webContents.executeJavaScript(`(() => {
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

    const state = await window.webContents.executeJavaScript(`(() => {
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
        reloadButtonExists,
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
    app.exit(
      state.toolbarVisible && sidebarResizable && workspacePickerReady ? 0 : 1,
    );
  } finally {
    window.destroy();
  }
}

checkAgentation().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  app.exit(2);
});
