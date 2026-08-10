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

let stopping = false;

async function stop(signal) {
  if (stopping) return;
  stopping = true;
  electron.kill(signal);
  await viteServer.close();
}

process.once('SIGINT', () => void stop('SIGINT'));
process.once('SIGTERM', () => void stop('SIGTERM'));

electron.once('error', async (error) => {
  console.error(error);
  await stop('SIGTERM');
  process.exitCode = 1;
});

electron.once('exit', async (code, signal) => {
  await viteServer.close();
  if (signal !== null) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
