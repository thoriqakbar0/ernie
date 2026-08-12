import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { Effect, Predicate } from 'effect';
import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 5173;
const rendererUrl = `http://${host}:${port}`;
const shutdownTimeoutMs = 5_000;
const electronApplicationPath = fileURLToPath(
  new URL('../node_modules/electron/dist/Electron.app', import.meta.url),
);
const electronCliPath = fileURLToPath(
  new URL('../node_modules/electron/cli.js', import.meta.url),
);
const developmentApplicationPath = fileURLToPath(
  new URL('../.build/Ernie-development.app', import.meta.url),
);
const developmentApplicationMarkerPath = path.join(
  developmentApplicationPath,
  'Contents',
  'Resources',
  '.ernie-electron-source',
);
const runFile = promisify(execFile);

async function prepareDevelopmentApplication() {
  const resolvedElectronApplicationPath = await realpath(
    electronApplicationPath,
  );
  const sourceIdentity = `${resolvedElectronApplicationPath}\n`;

  try {
    if (
      (await readFile(developmentApplicationMarkerPath, 'utf8')) ===
      sourceIdentity
    ) {
      return path.join(
        developmentApplicationPath,
        'Contents',
        'MacOS',
        'Ernie',
      );
    }

    await rename(
      developmentApplicationPath,
      `${developmentApplicationPath}.stale-${Date.now()}`,
    );
  } catch (error) {
    if (
      !Predicate.isRecord(error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    ) {
      throw error;
    }
  }

  await mkdir(path.dirname(developmentApplicationPath), { recursive: true });
  await runFile('/bin/cp', [
    '-cR',
    resolvedElectronApplicationPath,
    developmentApplicationPath,
  ]);

  const infoPlistPath = path.join(
    developmentApplicationPath,
    'Contents',
    'Info.plist',
  );
  const originalExecutablePath = path.join(
    developmentApplicationPath,
    'Contents',
    'MacOS',
    'Electron',
  );
  const brandedExecutablePath = path.join(
    developmentApplicationPath,
    'Contents',
    'MacOS',
    'Ernie',
  );

  await rename(originalExecutablePath, brandedExecutablePath);
  await runFile('/usr/bin/plutil', [
    '-replace',
    'CFBundleDisplayName',
    '-string',
    'Ernie',
    infoPlistPath,
  ]);
  await runFile('/usr/bin/plutil', [
    '-replace',
    'CFBundleName',
    '-string',
    'Ernie',
    infoPlistPath,
  ]);
  await runFile('/usr/bin/plutil', [
    '-replace',
    'CFBundleExecutable',
    '-string',
    'Ernie',
    infoPlistPath,
  ]);
  await runFile('/usr/bin/plutil', [
    '-replace',
    'CFBundleIdentifier',
    '-string',
    'com.thoriq.ernie.development',
    infoPlistPath,
  ]);
  await writeFile(developmentApplicationMarkerPath, sourceIdentity);
  await runFile('/usr/bin/codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    developmentApplicationPath,
  ]);

  return brandedExecutablePath;
}

function errorMetadata(error) {
  return {
    name: Predicate.isError(error) ? error.name : 'NonError',
    code:
      Predicate.isRecord(error) &&
      'code' in error &&
      (Predicate.isString(error.code) || Predicate.isNumber(error.code))
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

  const electronLaunch =
    process.platform === 'darwin'
      ? {
          executable: yield* Effect.tryPromise(() =>
            prepareDevelopmentApplication(),
          ),
          arguments: ['.'],
        }
      : {
          executable: process.execPath,
          arguments: [electronCliPath, '.'],
        };
  const electron = spawn(electronLaunch.executable, electronLaunch.arguments, {
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
