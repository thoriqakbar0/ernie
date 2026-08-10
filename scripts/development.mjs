import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 5173;
const rendererUrl = `http://${host}:${port}`;
const electronCliPath = fileURLToPath(
  new URL('../node_modules/electron/cli.js', import.meta.url),
);

const viteServer = await createServer({
  mode: 'development',
  server: {
    host,
    port,
    strictPort: true,
  },
});

await viteServer.listen();
viteServer.printUrls();

const electron = spawn(process.execPath, [electronCliPath, '.'], {
  env: {
    ...process.env,
    ERNIE_RENDERER_URL: rendererUrl,
  },
  stdio: 'inherit',
});

const shutdownTimeoutMs = 5_000;
let shutdownPromise;
let forcedExitTimer;

function errorMetadata(error) {
  return {
    name: error instanceof Error ? error.name : 'NonError',
    code:
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (typeof error.code === 'string' || typeof error.code === 'number')
        ? error.code
        : null,
  };
}

function closeViteWithDeadline() {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('Vite shutdown timed out.')),
      shutdownTimeoutMs,
    );
  });

  return Promise.race([viteServer.close(), timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function shutdown(signal, terminateElectron) {
  shutdownPromise ??= (async () => {
    try {
      await closeViteWithDeadline();
    } finally {
      if (
        terminateElectron &&
        electron.exitCode === null &&
        electron.signalCode === null
      ) {
        electron.kill(signal);
      }
    }
  })();
  return shutdownPromise;
}

function reportShutdownFailure(error) {
  console.error('Ernie development shutdown failed.', errorMetadata(error));
  process.exitCode = 1;
}

function handleSignal(signal) {
  forcedExitTimer ??= setTimeout(() => {
    console.error('Ernie development shutdown exceeded its deadline.');
    electron.kill('SIGKILL');
    process.exitCode = 1;
  }, shutdownTimeoutMs);

  void shutdown(signal, true).catch(reportShutdownFailure);
}

process.once('SIGINT', () => handleSignal('SIGINT'));
process.once('SIGTERM', () => handleSignal('SIGTERM'));

electron.once('error', (error) => {
  console.error('Electron process failed.', errorMetadata(error));
  void shutdown('SIGTERM', false)
    .catch(reportShutdownFailure)
    .finally(() => {
      process.exitCode = 1;
    });
});

electron.once('exit', (code, signal) => {
  clearTimeout(forcedExitTimer);
  void shutdown(signal ?? 'SIGTERM', false)
    .then(() => {
      process.exitCode = code ?? (signal === null ? 1 : 0);
    })
    .catch(reportShutdownFailure);
});
