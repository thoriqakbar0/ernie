import assert from 'node:assert/strict';
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

test('focuses Ernie through an owner-only local socket', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ernie-ui-control-'));
  const socketPath = path.join(directory, 'ui-control.sock');
  let focusCount = 0;
  const started = await startErnieUiControlServer(
    socketPath,
    () => {
      focusCount += 1;
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
    assert.equal(focusCount, 1);
  } finally {
    await started.value.close();
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
