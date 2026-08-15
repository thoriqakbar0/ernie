import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createErnieUiTool } from '../index';
import {
  startErnieUiControlServer,
  type ErnieUiControlCommand,
} from '../../ernie-ui-control/index';

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
}

function close(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(() => resolve()));
}

test('gives Prime Agent an Ernie UI tool backed by the real socket', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'ernie-agent-interaction-'),
  );
  try {
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
      const tool = createErnieUiTool(() => socketPath);
      assert.equal(tool.name, 'ernie_ui');
      assert.equal(tool.label, 'Ernie UI');
      assert.equal(tool.executionMode, 'sequential');

      const interactions = [
        { action: 'focus' },
        { action: 'set_theme', theme: 'dark' },
        { action: 'set_sidebar_open', open: false },
        { action: 'set_sidebar_width', width: 320 },
      ] as const;
      for (const interaction of interactions) {
        assert.deepEqual(await tool.execute('tool-call', interaction, undefined), {
          content: [
            { text: 'Ernie accepted the UI interaction.', type: 'text' },
          ],
          details: { interaction },
        });
      }

      assert.deepEqual(commands, [
        { type: 'focus' },
        { theme: 'dark', type: 'set-theme' },
        { open: false, type: 'set-sidebar-open' },
        { type: 'set-sidebar-width', width: 320 },
      ]);
    } finally {
      await started.value.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('rejects through the tool boundary when Ernie is unavailable', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'ernie-agent-interaction-offline-'),
  );
  try {
    const tool = createErnieUiTool(() => path.join(directory, 'missing.sock'));
    await assert.rejects(
      tool.execute('tool-call', { action: 'focus' }, undefined),
      /Ernie is not running\./u,
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('cancels an in-flight interaction through the tool boundary', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'ernie-agent-interaction-cancel-'),
  );
  const sockets = new Set<Socket>();
  const cancellation = new Error('Agent cancelled the Ernie UI interaction.');
  const controller = new AbortController();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.once('data', () => controller.abort(cancellation));
  });
  try {
    const socketPath = path.join(directory, 'ui-control.sock');
    await listen(server, socketPath);
    const tool = createErnieUiTool(() => socketPath);

    await assert.rejects(
      tool.execute('tool-call', { action: 'focus' }, controller.signal),
      cancellation,
    );
  } finally {
    for (const socket of sockets) socket.destroy();
    await close(server);
    await rm(directory, { force: true, recursive: true });
  }
});

test('rejects tools without a hosting Ernie socket', async () => {
  const tool = createErnieUiTool(() => undefined);
  await assert.rejects(
    tool.execute('tool-call', { action: 'focus' }, undefined),
    /Ernie UI interaction is unavailable in this host\./u,
  );
});
