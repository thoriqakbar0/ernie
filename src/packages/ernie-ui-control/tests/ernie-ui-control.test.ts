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
  runErnieUiControlCli,
  startErnieUiControlServer,
  type ErnieUiControlCommand,
} from '../index';

test('parses only supported UI commands and versions', () => {
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
  assert.deepEqual(
    parseErnieUiControlRequest({
      command: { open: true, type: 'set-sidebar-open' },
      version: 1,
    }),
    { open: true, type: 'set-sidebar-open' },
  );
  assert.deepEqual(
    parseErnieUiControlRequest({
      command: { type: 'set-sidebar-width', width: 320 },
      version: 1,
    }),
    { type: 'set-sidebar-width', width: 320 },
  );
  assert.equal(
    parseErnieUiControlRequest({
      command: { type: 'set-sidebar-width', width: 191 },
      version: 1,
    }),
    null,
  );
  assert.equal(
    parseErnieUiControlRequest({
      command: { type: 'set-sidebar-width', width: 320.5 },
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
  assert.deepEqual(
    parseErnieUiControlCliArguments(['ui', 'sidebar', 'show']),
    {
      command: { open: true, type: 'set-sidebar-open' },
      ok: true,
    },
  );
  assert.deepEqual(
    parseErnieUiControlCliArguments(['ui', 'sidebar', 'hide']),
    {
      command: { open: false, type: 'set-sidebar-open' },
      ok: true,
    },
  );
  assert.deepEqual(
    parseErnieUiControlCliArguments(['--', 'ui', 'sidebar', 'width', '320']),
    {
      command: { type: 'set-sidebar-width', width: 320 },
      ok: true,
    },
  );
  assert.equal(
    parseErnieUiControlCliArguments(['ui', 'sidebar', 'width', '191']).ok,
    false,
  );
  assert.equal(
    parseErnieUiControlCliArguments(['ui', 'sidebar', 'width', '320.5']).ok,
    false,
  );
  assert.equal(parseErnieUiControlCliArguments(['agent', 'list']).ok, false);
});

test('accepts every documented sidebar width', () => {
  for (let width = 192; width <= 384; width += 1) {
    assert.deepEqual(
      parseErnieUiControlCliArguments([
        'ui',
        'sidebar',
        'width',
        String(width),
      ]),
      { command: { type: 'set-sidebar-width', width }, ok: true },
    );
  }
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
    assert.deepEqual(
      await requestErnieUiControl(socketPath, {
        open: false,
        type: 'set-sidebar-open',
      }),
      { ok: true, version: 1 },
    );
    assert.deepEqual(
      await requestErnieUiControl(socketPath, {
        type: 'set-sidebar-width',
        width: 320,
      }),
      { ok: true, version: 1 },
    );
    assert.deepEqual(commands, [
      { type: 'focus' },
      { theme: 'dark', type: 'set-theme' },
      { open: false, type: 'set-sidebar-open' },
      { type: 'set-sidebar-width', width: 320 },
    ]);
  } finally {
    await started.value.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test('runs existing UI commands through the public CLI seam', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ernie-ui-control-cli-'));
  const socketPath = path.join(directory, 'ui-control.sock');
  const commands: ErnieUiControlCommand[] = [];
  const output: string[] = [];
  const errors: string[] = [];
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
    const runtime = {
      request: (command: ErnieUiControlCommand) =>
        requestErnieUiControl(socketPath, command),
      writeError: (message: string) => errors.push(message),
      writeOutput: (message: string) => output.push(message),
    };
    const cases = [
      {
        arguments_: ['ui', 'focus'],
        command: { type: 'focus' },
        output: 'Ernie focused.',
      },
      {
        arguments_: ['ui', 'theme', 'dark'],
        command: { theme: 'dark', type: 'set-theme' },
        output: 'Ernie theme set to dark.',
      },
      {
        arguments_: ['ui', 'theme', 'light'],
        command: { theme: 'light', type: 'set-theme' },
        output: 'Ernie theme set to light.',
      },
      {
        arguments_: ['ui', 'sidebar', 'show'],
        command: { open: true, type: 'set-sidebar-open' },
        output: 'Ernie sidebar shown.',
      },
      {
        arguments_: ['ui', 'sidebar', 'hide'],
        command: { open: false, type: 'set-sidebar-open' },
        output: 'Ernie sidebar hidden.',
      },
      {
        arguments_: ['--', 'ui', 'sidebar', 'width', '320'],
        command: { type: 'set-sidebar-width', width: 320 },
        output: 'Ernie sidebar width set to 320px.',
      },
      {
        arguments_: ['ui', 'sidebar', 'width', '192'],
        command: { type: 'set-sidebar-width', width: 192 },
        output: 'Ernie sidebar width set to 192px.',
      },
      {
        arguments_: ['ui', 'sidebar', 'width', '384'],
        command: { type: 'set-sidebar-width', width: 384 },
        output: 'Ernie sidebar width set to 384px.',
      },
    ] as const;

    for (const testCase of cases) {
      assert.equal(
        await runErnieUiControlCli(testCase.arguments_, runtime),
        0,
      );
    }

    assert.deepEqual(
      commands,
      cases.map((testCase) => testCase.command),
    );
    assert.deepEqual(
      output,
      cases.map((testCase) => testCase.output),
    );
    assert.deepEqual(errors, []);
  } finally {
    await started.value.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test('generates focused nested CLI help without contacting Ernie', async () => {
  const output: string[] = [];
  const errors: string[] = [];
  const runtime = {
    request: (): never => {
      throw new Error('Help must not contact Ernie.');
    },
    writeError: (message: string) => errors.push(message),
    writeOutput: (message: string) => output.push(message),
  };

  assert.equal(
    await runErnieUiControlCli(['ui', 'sidebar', '--help'], runtime),
    0,
  );
  assert.deepEqual(output, [
    'Usage:\n' +
      '  ernie ui sidebar <show|hide>\n' +
      '  ernie ui sidebar width <192..384>',
  ]);
  assert.deepEqual(errors, []);

  output.length = 0;
  assert.equal(
    await runErnieUiControlCli(['ui', 'theme', 'system'], runtime),
    2,
  );
  assert.deepEqual(output, []);
  assert.deepEqual(errors, ['Usage: ernie ui theme <dark|light>']);

  errors.length = 0;
  assert.equal(
    await runErnieUiControlCli(['ui', 'bogus', '--help'], runtime),
    2,
  );
  assert.deepEqual(output, []);
  assert.deepEqual(errors, [
    'Usage:\n' +
      '  ernie ui focus\n' +
      '  ernie ui theme <dark|light>\n' +
      '  ernie ui sidebar <show|hide>\n' +
      '  ernie ui sidebar width <192..384>',
  ]);

  errors.length = 0;
  assert.equal(
    await runErnieUiControlCli(['agent', 'list', '--help'], runtime),
    2,
  );
  assert.deepEqual(output, []);
  assert.equal(errors.length, 1);

  errors.length = 0;
  assert.equal(
    await runErnieUiControlCli(['--', '--', 'ui', 'focus'], runtime),
    2,
  );
  assert.deepEqual(output, []);
  assert.equal(errors.length, 1);
});

test('reports safe runtime failures through the public CLI seam', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'ernie-ui-control-cli-failure-'),
  );
  const socketPath = path.join(directory, 'ui-control.sock');
  const output: string[] = [];
  const errors: string[] = [];
  const started = await startErnieUiControlServer(
    socketPath,
    () => ({
      error: { code: 'ui_unavailable', message: 'Ernie has no open window.' },
      ok: false,
      version: 1,
    }),
    () => undefined,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;

  try {
    const exitCode = await runErnieUiControlCli(['ui', 'focus'], {
      request: (command) => requestErnieUiControl(socketPath, command),
      writeError: (message) => errors.push(message),
      writeOutput: (message) => output.push(message),
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(output, []);
    assert.deepEqual(errors, ['Ernie has no open window.']);
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
