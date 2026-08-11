import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 5173;
const rendererQuery = process.env.ERNIE_RENDERER_QUERY;
const rendererUrl =
  rendererQuery === undefined
    ? `http://${host}:${port}`
    : `http://${host}:${port}?${rendererQuery}`;
const shutdownTimeoutMs = 5_000;
const electronCliPath = fileURLToPath(
  new URL('../node_modules/electron/cli.js', import.meta.url),
);

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

const development = Effect.fn('Development.start')(function* () {
  const viteServer = yield* Effect.tryPromise(() =>
    createServer({
      mode: 'development',
      server: {
        host,
        port,
        strictPort: true,
      },
    }),
  );

  yield* Effect.tryPromise(() => viteServer.listen());
  viteServer.printUrls();

  const electron = spawn(process.execPath, [electronCliPath, '.'], {
    env: {
      ...process.env,
      ERNIE_RENDERER_URL: rendererUrl,
    },
    stdio: 'inherit',
  });

  let shutdownStarted = false;
  let forcedExitTimer;

  const closeViteWithDeadline = Effect.tryPromise(() =>
    viteServer.close(),
  ).pipe(
    Effect.timeoutFail({
      duration: shutdownTimeoutMs,
      onTimeout: () => new Error('Vite shutdown timed out.'),
    }),
  );

  const shutdown = (signal, terminateElectron, exitCode) => {
    if (shutdownStarted) return;
    shutdownStarted = true;

    Effect.runFork(
      closeViteWithDeadline.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (
              terminateElectron &&
              electron.exitCode === null &&
              electron.signalCode === null
            ) {
              electron.kill(signal);
            }
          }),
        ),
        Effect.match({
          onFailure: (error) => {
            console.error(
              'Ernie development shutdown failed.',
              errorMetadata(error),
            );
            process.exitCode = 1;
          },
          onSuccess: () => {
            process.exitCode = exitCode;
          },
        }),
      ),
    );
  };

  const handleSignal = (signal) => {
    forcedExitTimer ??= setTimeout(() => {
      console.error('Ernie development shutdown exceeded its deadline.');
      electron.kill('SIGKILL');
      process.exitCode = 1;
    }, shutdownTimeoutMs);

    shutdown(signal, true, process.exitCode ?? 0);
  };

  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));

  electron.once('error', (error) => {
    console.error('Electron process failed.', errorMetadata(error));
    shutdown('SIGTERM', false, 1);
  });

  electron.once('exit', (code, signal) => {
    clearTimeout(forcedExitTimer);
    shutdown(signal ?? 'SIGTERM', false, code ?? (signal === null ? 1 : 0));
  });
});

Effect.runFork(
  development().pipe(
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error('Ernie development startup failed.', errorMetadata(error));
        process.exitCode = 1;
      }),
    ),
  ),
);
