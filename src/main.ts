import { app, BrowserWindow } from 'electron';
import path from 'node:path';

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 820,
    minHeight: 520,
    backgroundColor: '#111113',
    show: false,
    title: 'Ernie',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
    },
  });

  await window.loadFile(path.join(__dirname, '../renderer/index.html'));

  window.show();
  return window;
}

function reportStartupFailure(error: unknown): void {
  console.error('Ernie could not open its main window.', error);
  app.quit();
}

async function startApplication(): Promise<void> {
  await app.whenReady();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch(reportStartupFailure);
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

void startApplication().catch(reportStartupFailure);
