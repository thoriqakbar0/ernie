import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  DaemonCommand,
  DaemonResponse,
} from 'prime-agent' with { 'resolution-mode': 'import' };
import { Effect } from 'effect';

import {
  createPrimeAgentControlClient,
  type PrimeAgentControlTransport,
  type PrimeAgentReconnectStatus,
} from '../server';

class FakeControlTransport implements PrimeAgentControlTransport {
  isConnected = false;
  closeCount = 0;
  connectCount = 0;
  commands: DaemonCommand[] = [];
  reconnectStatus: ((status: PrimeAgentReconnectStatus) => void) | undefined;

  close(): void {
    this.closeCount += 1;
    this.isConnected = false;
  }

  async connect(): Promise<void> {
    this.connectCount += 1;
    this.isConnected = true;
  }

  enableAutoReconnect(options: {
    readonly onStatus?: (status: PrimeAgentReconnectStatus) => void;
  }): void {
    this.reconnectStatus = options.onStatus;
  }

  async request(command: DaemonCommand): Promise<DaemonResponse> {
    this.commands.push(command);
    return {
      command: command.type,
      data: null,
      id: 'response',
      success: true,
      type: 'response',
    };
  }

  async waitForHello(): Promise<unknown> {
    return { type: 'daemon_hello' };
  }
}

test('shares one connected Prime Agent command transport', async () => {
  const transport = new FakeControlTransport();
  let createCount = 0;
  let recoverCount = 0;
  const client = createPrimeAgentControlClient({
    connectTimeoutMs: 100,
    createTransport: async () => {
      createCount += 1;
      return transport;
    },
    recoverDaemon: async () => {
      recoverCount += 1;
    },
    reconnectTimeoutMs: 1_000,
    reportFailure: () => undefined,
  });

  const responses = await Effect.runPromise(
    Effect.all(
      [
        client.request({ type: 'list' }, 100),
        client.request({ type: 'list_saved_sessions', cwd: '/tmp', scope: 'all' }, 100),
      ],
      { concurrency: 'unbounded' },
    ),
  );

  assert.equal(responses.length, 2);
  assert.equal(createCount, 1);
  assert.equal(recoverCount, 1);
  assert.equal(transport.connectCount, 1);
  assert.deepEqual(transport.commands.map((command) => command.type), [
    'list',
    'list_saved_sessions',
  ]);
  assert.equal(client.state(), 'ready');

  client.close();
  assert.equal(transport.closeCount, 1);
  assert.equal(client.state(), 'closed');
});

test('waits for Prime Agent recovery before sending a new command', async () => {
  const transport = new FakeControlTransport();
  const client = createPrimeAgentControlClient({
    connectTimeoutMs: 100,
    createTransport: async () => transport,
    recoverDaemon: async () => undefined,
    reconnectTimeoutMs: 1_000,
    reportFailure: () => undefined,
  });

  await Effect.runPromise(client.request({ type: 'list' }, 100));
  transport.isConnected = false;
  transport.reconnectStatus?.({ status: 'reconnecting', error: 'socket closed' });
  const pending = Effect.runPromise(client.request({ type: 'list' }, 100));
  await Promise.resolve();
  assert.equal(transport.commands.length, 1);

  transport.isConnected = true;
  transport.reconnectStatus?.({ status: 'connected' });
  await pending;

  assert.equal(transport.commands.length, 2);
  assert.equal(client.state(), 'ready');
  client.close();
});
