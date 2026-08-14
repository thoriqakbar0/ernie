import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  parseErnieUiControlCliArguments,
  parseErnieUiControlRequest,
  parseErnieUiControlResult,
  requestErnieUiControl,
  startErnieUiControlServer,
  type ErnieUiControlCommand,
} from '../index';

test('parses only the UI focus command and version', () => {
  assert.deepEqual(
    parseErnieUiControlRequest({
      command: { type: 'focus' },
      version: 1,
    }),
    { type: 'focus' },
  );
  assert.equal(
    parseErnieUiControlRequest({
      command: { type: 'send-task' },
      version: 1,
    }),
    null,
  );
  assert.deepEqual(
    parseErnieUiControlRequest({
      command: { theme: 'dark', type: 'set-theme' },
      version: 1,
    }),
    { theme: 'dark', type: 'set-theme' },
  );
  assert.equal(
    parseErnieUiControlRequest({
      command: { theme: 'system', type: 'set-theme' },
      version: 1,
    }),
    null,
  );
  assert.equal(
    parseErnieUiControlRequest({
      command: { type: 'focus' },
      version: 2,
    }),
    null,
  );
  assert.deepEqual(parseErnieUiControlCliArguments(['ui', 'focus']), {
    command: { type: 'focus' },
    ok: true,
  });
  assert.deepEqual(parseErnieUiControlCliArguments(['--', 'ui', 'focus']), {
    command: { type: 'focus' },
    ok: true,
  });
  assert.deepEqual(
    parseErnieUiControlCliArguments(['ui', 'theme', 'dark']),
    {
      command: { theme: 'dark', type: 'set-theme' },
      ok: true,
    },
  );
  assert.deepEqual(
    parseErnieUiControlCliArguments(['--', 'ui', 'theme', 'light']),
    {
      command: { theme: 'light', type: 'set-theme' },
      ok: true,
    },
  );
  assert.equal(
    parseErnieUiControlCliArguments(['ui', 'theme', 'system']).ok,
    false,
  );
  assert.equal(parseErnieUiControlCliArguments(['agent', 'list']).ok, false);
});

test('parses safe UI-control responses', () => {
  assert.deepEqual(parseErnieUiControlResult({ ok: true, version: 1 }), {
    ok: true,
    version: 1,
  });
  assert.deepEqual(
    parseErnieUiControlResult({
      error: { code: 'ui_unavailable', message: 'No window.' },
      ok: false,
      version: 1,
    }),
    {
      error: { code: 'ui_unavailable', message: 'No window.' },
      ok: false,
      version: 1,
    },
  );
  assert.equal(
    parseErnieUiControlResult({
      error: { code: 'secret', message: 'No.' },
      ok: false,
      version: 1,
    }),
    null,
  );
});

test('controls Ernie through an owner-only local socket', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ernie-ui-control-'));
  const socketPath = path.join(directory, 'ui-control.sock');
  const commands: ErnieUiControlCommand[] = [];
  const started = await startErnieUiControlServer(
    socketPath,
    (command) => {
      commands.push(command);
      return { ok: true, version: 1 };
    },
    () => undefined,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;

  try {
    assert.equal((await stat(socketPath)).mode & 0o777, 0o600);
    assert.deepEqual(
      await requestErnieUiControl(socketPath, { type: 'focus' }),
      { ok: true, version: 1 },
    );
    assert.deepEqual(
      await requestErnieUiControl(socketPath, {
        theme: 'dark',
        type: 'set-theme',
      }),
      { ok: true, version: 1 },
    );
    assert.deepEqual(commands, [
      { type: 'focus' },
      { theme: 'dark', type: 'set-theme' },
    ]);
  } finally {
    await started.value.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test('replaces a stale UI-control socket during startup', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ernie-ui-control-stale-'));
  const socketPath = path.join(directory, 'ui-control.sock');
  const orphan = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "import { createServer } from 'node:net'; createServer().listen(process.argv[1], () => process.kill(process.pid, 'SIGKILL'));",
      socketPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(orphan.signal, 'SIGKILL');
  assert.equal((await stat(socketPath)).isSocket(), true);

  const started = await startErnieUiControlServer(
    socketPath,
    () => ({ ok: true, version: 1 }),
    () => undefined,
  );

  try {
    assert.equal(started.ok, true);
  } finally {
    if (started.ok) await started.value.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test('preserves an active UI-control socket during competing startup', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ernie-ui-control-active-'));
  const socketPath = path.join(directory, 'ui-control.sock');
  let requestCount = 0;
  const active = await startErnieUiControlServer(
    socketPath,
    () => {
      requestCount += 1;
      return { ok: true, version: 1 };
    },
    () => undefined,
  );
  assert.equal(active.ok, true);
  if (!active.ok) return;

  try {
    const competing = await startErnieUiControlServer(
      socketPath,
      () => ({ ok: true, version: 1 }),
      () => undefined,
    );
    assert.equal(competing.ok, false);
    assert.deepEqual(
      await requestErnieUiControl(socketPath, { type: 'focus' }),
      { ok: true, version: 1 },
    );
    assert.equal(requestCount, 1);
  } finally {
    await active.value.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test('reports a stopped application without exposing socket errors', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ernie-ui-control-offline-'));
  const socketPath = path.join(directory, 'ui-control.sock');
  try {
    assert.deepEqual(
      await requestErnieUiControl(socketPath, { type: 'focus' }),
      {
        error: { code: 'app_unavailable', message: 'Ernie is not running.' },
        ok: false,
        version: 1,
      },
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
