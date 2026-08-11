import { spawn } from 'node:child_process';

import { Effect } from 'effect';

import type { PrimeAgentDaemonConfiguration } from '../types';

/** Start one detached Prime Agent daemon process without owning its lifetime. */
export function startPrimeAgentDaemonProcess(
  configuration: PrimeAgentDaemonConfiguration,
  socketPath: string,
): Effect.Effect<void, unknown> {
  return Effect.tryPromise(
    () =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(
          configuration.executablePath,
          [
            configuration.daemonEntrypointPath,
            '--mode',
            'daemon',
            '--daemon-socket',
            socketPath,
          ],
          {
            cwd: configuration.currentCwd,
            detached: true,
            env: {
              ...process.env,
              ELECTRON_RUN_AS_NODE: '1',
            },
            stdio: 'ignore',
          },
        );

        child.once('error', reject);
        child.once('spawn', () => {
          child.unref();
          resolve();
        });
      }),
  );
}
