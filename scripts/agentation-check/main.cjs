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

    const state = await window.webContents.executeJavaScript(`(() => {
      const toolbar = document.querySelector('[data-agentation-toolbar]');
      if (!(toolbar instanceof HTMLElement)) {
        return { exists: false, visible: false };
      }

      const bounds = toolbar.getBoundingClientRect();
      const style = getComputedStyle(toolbar);
      return {
        exists: true,
        visible:
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
      `${JSON.stringify({ ...state, loadMs, readyMs, revealReadyMs })}\n`,
    );
    app.exit(state.visible ? 0 : 1);
  } finally {
    window.destroy();
  }
}

checkAgentation().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  app.exit(2);
});
