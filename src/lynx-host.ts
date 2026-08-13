import { access, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { WindowedLynxView } from '@lynx-js/node-lynx';
import { Effect } from 'effect';

import { createPrimeAgentDaemon } from './packages/prime-agent-daemon/server.js';
import type {
  PrimeAgentSession,
} from './packages/prime-agent-daemon/types.js';

const rosterRefreshMilliseconds = 500;
const require = createRequire(import.meta.url);

interface LynxNaturalScrollAddon {
  readonly installNaturalScrolling: () => unknown;
}

type LynxActiveAgent = PrimeAgentSession & Readonly<{
  sessionJsonl: string | null;
}>;

interface CachedSessionJsonl {
  readonly content: string;
  readonly modifiedAtMilliseconds: number;
  readonly size: number;
}

type LynxDaemonRoster = Readonly<{
  activeAgents: readonly LynxActiveAgent[];
  connection: 'ready' | 'unavailable';
  currentCwd: string;
  revision: number;
}>;

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

function isLynxNaturalScrollAddon(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This parser owns the compiled native-addon boundary.
  value: unknown,
): value is LynxNaturalScrollAddon {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- This parser owns the compiled native-addon boundary.
  if (typeof value !== 'object' || value === null) return false;
  return 'installNaturalScrolling' in value
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The boundary accepts exactly one callable native export.
    && typeof value.installNaturalScrolling === 'function';
}

function installNaturalScrolling(repositoryRoot: string): void {
  const addonPath = path.join(
    repositoryRoot,
    '.build/native/lynx-natural-scroll.node',
  );
  const addon: unknown = require(addonPath);
  if (!isLynxNaturalScrollAddon(addon)) {
    throw new Error('The Lynx natural scrolling adapter has an invalid interface.');
  }
  if (addon.installNaturalScrolling() !== true) {
    throw new Error('The Lynx natural scrolling adapter did not install.');
  }
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
  installNaturalScrolling(repositoryRoot);
  let closed = false;
  let revision = 0;
  let previousPayload = '';
  const sessionJsonlCache = new Map<string, CachedSessionJsonl>();
  const close = (): void => {
    if (closed) return;
    closed = true;
    view.close();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);

  const readSessionJsonl = async (
    sessionPath: string | null,
  ): Promise<string | null> => {
    if (sessionPath === null) return null;
    try {
      const metadata = await stat(sessionPath);
      const cached = sessionJsonlCache.get(sessionPath);
      if (
        cached !== undefined &&
        cached.modifiedAtMilliseconds === metadata.mtimeMs &&
        cached.size === metadata.size
      ) {
        return cached.content;
      }
      const content = await readFile(sessionPath, 'utf8');
      sessionJsonlCache.set(sessionPath, {
        content,
        modifiedAtMilliseconds: metadata.mtimeMs,
        size: metadata.size,
      });
      return content;
    } catch {
      sessionJsonlCache.delete(sessionPath);
      return null;
    }
  };

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
    const activeAgents = await Promise.all(
      workspace.value.sessions.map(async (session): Promise<LynxActiveAgent> => ({
        ...session,
        sessionJsonl: await readSessionJsonl(session.sessionPath),
      })),
    );
    return {
      activeAgents,
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
