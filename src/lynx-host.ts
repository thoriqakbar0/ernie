import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { WindowedLynxView } from '@lynx-js/node-lynx';
import { Effect } from 'effect';

import { createPrimeAgentDaemon } from './packages/prime-agent-daemon/server.js';
import type {
  PrimeAgentSession,
  PrimeAgentSessionActivity,
} from './packages/prime-agent-daemon/types.js';

const rosterRefreshMilliseconds = 500;

interface LynxActiveAgent {
  readonly activeSessionId: string;
  readonly activity: PrimeAgentSessionActivity;
  readonly cwd: string;
  readonly modifiedAt: string | null;
  readonly name: string;
}

type LynxDaemonRoster = Readonly<{
  activeAgents: readonly LynxActiveAgent[];
  connection: 'ready' | 'unavailable';
  currentCwd: string;
  revision: number;
}>;

function projectActiveAgent(session: PrimeAgentSession): LynxActiveAgent {
  return {
    activeSessionId: session.activeSessionId,
    activity: session.activity,
    cwd: session.cwd,
    modifiedAt: session.modifiedAt,
    name: session.name,
  };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

/** Run the native Lynx receiver and feed it Prime Agent's live agent roster. */
async function run(): Promise<void> {
  const repositoryRoot = process.cwd();
  const bundlePath = path.join(repositoryRoot, 'lynx/dist/main.lynx.bundle');
  await access(bundlePath);

  const daemon = createPrimeAgentDaemon({
    currentCwd: repositoryRoot,
    daemonEntrypointPath: path.join(
      import.meta.dirname,
      'packages/prime-agent-daemon/daemon-runner.js',
    ),
    executablePath: process.execPath,
    sessionNameExtensionPath: path.join(
      import.meta.dirname,
      'packages/session-name-hook/index.js',
    ),
  });
  const view = new WindowedLynxView({
    devicePixelRatio: 1,
    height: 800,
    title: 'Ernie + Lynx',
    width: 1_200,
  });
  let closed = false;
  let revision = 0;
  let previousPayload = '';
  const close = (): void => {
    if (closed) return;
    closed = true;
    view.close();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);

  const receiveRoster = async (): Promise<LynxDaemonRoster> => {
    const workspace = await Effect.runPromise(daemon.listWorkspace());
    if (!workspace.ok) {
      return {
        activeAgents: [],
        connection: 'unavailable',
        currentCwd: repositoryRoot,
        revision,
      };
    }
    return {
      activeAgents: workspace.value.sessions.map(projectActiveAgent),
      connection: 'ready',
      currentCwd: workspace.value.currentCwd,
      revision,
    };
  };

  const nextRoster = async (): Promise<LynxDaemonRoster> => {
    const roster = await receiveRoster();
    const payload = JSON.stringify({
      activeAgents: roster.activeAgents,
      connection: roster.connection,
      currentCwd: roster.currentCwd,
    });
    if (payload !== previousPayload) {
      previousPayload = payload;
      revision += 1;
    }
    return { ...roster, revision };
  };

  try {
    const initialRoster = await nextRoster();
    await view.loadTemplate(await readFile(bundlePath), {
      initialData: { daemonRoster: initialRoster },
      url: pathToFileURL(bundlePath).toString(),
    });
    await view.waitForFrame();
    await view.flushFrame(100);
    console.log(
      `Ernie + Lynx received ${initialRoster.activeAgents.length} active agents from Prime Agent.`,
    );
    let deliveredRevision = initialRoster.revision;

    const receiveLoop = (async (): Promise<void> => {
      while (!closed) {
        await wait(rosterRefreshMilliseconds);
        if (closed) return;
        const roster = await nextRoster();
        if (roster.revision === deliveredRevision) continue;
        view.updateData({ daemonRoster: roster });
        deliveredRevision = roster.revision;
        console.log(
          `Ernie + Lynx received ${roster.activeAgents.length} active agents from Prime Agent.`,
        );
      }
    })();

    await view.waitUntilClosed();
    closed = true;
    await receiveLoop;
  } finally {
    closed = true;
    daemon.close();
    view.destroy();
    process.removeListener('SIGINT', close);
    process.removeListener('SIGTERM', close);
  }
}

await run();
