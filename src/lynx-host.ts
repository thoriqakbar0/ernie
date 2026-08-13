import { access } from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

const daemonHealthUrl = 'http://127.0.0.1:4319/v1/health';
const daemonStartupAttempts = 50;
const daemonStartupIntervalMilliseconds = 100;

function waitForExit(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

async function waitForDaemon(): Promise<void> {
  for (let attempt = 0; attempt < daemonStartupAttempts; attempt += 1) {
    try {
      const response = await fetch(daemonHealthUrl);
      if (response.ok) return;
    } catch {
      // The sidecar may still be binding its loopback socket.
    }
    await new Promise(resolve => {
      setTimeout(resolve, daemonStartupIntervalMilliseconds);
    });
  }
  throw new Error('The Ernie Lynx daemon did not become ready.');
}

function stopChild(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
}

async function run(): Promise<void> {
  const repositoryRoot = process.cwd();
  const bundlePath = path.join(repositoryRoot, 'lynx/dist/main.lynx.bundle');
  const daemonPath = path.join(repositoryRoot, '.build/main/lynx-daemon-bridge.js');
  await Promise.all([access(bundlePath), access(daemonPath)]);

  const daemon = spawn(process.execPath, [daemonPath], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  let runtime: ChildProcess | null = null;
  const stop = (): void => {
    if (runtime !== null) stopChild(runtime);
    stopChild(daemon);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    await waitForDaemon();
    runtime = spawn('nub', [
      'dlx',
      '@lynx-js/node-lynx@0.1.1',
      'preview',
      '--template',
      bundlePath,
      '--width',
      '1200',
      '--height',
      '800',
      '--dpr',
      '1',
      '--title',
      'Ernie + Lynx',
      '--no-debug-router',
    ], {
      cwd: repositoryRoot,
      stdio: 'inherit',
    });

    const exitCode = await Promise.race([
      waitForExit(runtime),
      waitForExit(daemon),
    ]);
    process.exitCode = exitCode;
  } finally {
    stop();
  }
}

await run();
