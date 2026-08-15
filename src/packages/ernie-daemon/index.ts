import { Effect, Fiber, Stream } from 'effect';
import { isJsonString, type JsonValue } from '../json-value/index.js';
import { parsePrimeAgentSessionHistoryRequest } from '../prime-agent-daemon/client.js';
import { createAgentSessionViewCache } from './lib/session-view-cache.js';
import {
  agentSessionHistoryPage,
  windowAgentSessionFeed,
} from './lib/session-window.js';
import type {
  AgentConfiguration,
  AgentModel,
  AgentRefinementReceipt,
  AgentResult,
  AgentRlmDepth,
  AgentSavedSession,
  AgentSession,
  AgentSessionFeedItem,
  AgentSessionHistoryPage,
  AgentSessionRenameReceipt,
  AgentSkill,
  AgentTaskReceipt,
  AgentWorkspace,
  AgentWorkspaceFeedItem,
} from './client.js';

/** Standard capabilities that an Ernie agent harness can expose. */
export type AgentHarnessCapability =
  | 'live-sessions'
  | 'saved-sessions'
  | 'models'
  | 'thinking-level'
  | 'skills'
  | 'rlm-depth'
  | 'refinement';

/** Stable identity and supported operations for one Ernie agent harness. */
export interface AgentHarnessDescriptor {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly AgentHarnessCapability[];
}

/** Harness-neutral operations consumed by Ernie's Electron process. */
export interface AgentHarnessOperations {
  readonly listWorkspace: () => Effect.Effect<AgentResult<AgentWorkspace>>;
  readonly listModels: (
    scope: JsonValue,
  ) => Effect.Effect<AgentResult<readonly AgentModel[]>>;
  readonly getConfiguration: (
    activeSessionId: JsonValue,
  ) => Effect.Effect<AgentResult<AgentConfiguration>>;
  readonly listSkills: (
    activeSessionId: JsonValue,
  ) => Effect.Effect<AgentResult<readonly AgentSkill[]>>;
  readonly sessionFeed: (
    activeSessionId: JsonValue,
  ) => Stream.Stream<AgentSessionFeedItem>;
  readonly workspaceFeed: () => Stream.Stream<AgentWorkspaceFeedItem>;
  readonly createSession: (
    creation: JsonValue,
  ) => Effect.Effect<AgentResult<AgentSession>>;
  readonly listSavedSessions: () => Effect.Effect<
    AgentResult<readonly AgentSavedSession[]>
  >;
  readonly importSession: (
    sessionPath: JsonValue,
  ) => Effect.Effect<AgentResult<AgentSession>>;
  readonly renameSession: (
    rename: JsonValue,
  ) => Effect.Effect<AgentResult<AgentSessionRenameReceipt>>;
  readonly setModel: (
    selection: JsonValue,
  ) => Effect.Effect<AgentResult<AgentConfiguration>>;
  readonly setThinkingLevel: (
    selection: JsonValue,
  ) => Effect.Effect<AgentResult<AgentConfiguration>>;
  readonly getRlmDepth: (
    activeSessionId: JsonValue,
  ) => Effect.Effect<AgentResult<AgentRlmDepth>>;
  readonly setRlmDepth: (
    selection: JsonValue,
  ) => Effect.Effect<AgentResult<AgentRlmDepth>>;
  readonly submitTask: (
    submission: JsonValue,
  ) => Effect.Effect<AgentResult<AgentTaskReceipt>>;
  readonly refineSession: (
    request: JsonValue,
  ) => Effect.Effect<AgentResult<AgentRefinementReceipt>>;
  readonly close: () => void;
}

/** One provider-owned adapter installed behind Ernie's stable daemon boundary. */
export interface AgentHarnessAdapter extends AgentHarnessOperations {
  readonly descriptor: AgentHarnessDescriptor;
}

/** Ernie's immutable daemon API with one selected harness adapter. */
export interface ErnieDaemon extends AgentHarnessOperations {
  readonly harness: AgentHarnessDescriptor;
  /** Load one bounded transcript page before the requested history index. */
  readonly loadSessionHistory: (
    request: JsonValue,
  ) => Effect.Effect<AgentResult<AgentSessionHistoryPage>>;
}

/** Configuration that installs one harness behind Ernie's daemon API. */
export interface ErnieDaemonConfiguration {
  readonly harness: AgentHarnessAdapter;
}

interface OwnedSessionWarmup {
  fiber: Fiber.Fiber<void> | null;
}

interface OwnedDaemonShutdown {
  fiber: Fiber.Fiber<void> | null;
}

const maximumPrewarmedSessions = 24;
const maximumConcurrentWarmups = 4;

function normalizedDescriptor(
  descriptor: AgentHarnessDescriptor,
): AgentHarnessDescriptor {
  const id = descriptor.id.trim();
  const name = descriptor.name.trim();
  if (id.length === 0 || name.length === 0) {
    throw new Error('An Ernie harness id and name must not be empty.');
  }
  const capabilities = [...new Set(descriptor.capabilities)];
  if (capabilities.length !== descriptor.capabilities.length) {
    throw new Error('An Ernie harness must not declare duplicate capabilities.');
  }
  return Object.freeze({
    capabilities: Object.freeze(capabilities),
    id,
    name,
  });
}

function normalizedSessionId(value: JsonValue): string | null {
  if (!isJsonString(value)) return null;
  const activeSessionId = value.trim();
  return activeSessionId.length === 0 ? null : activeSessionId;
}

/** Install one runtime adapter behind Ernie's stable daemon boundary. */
export function createErnieDaemon(
  configuration: ErnieDaemonConfiguration,
): ErnieDaemon {
  const adapter = configuration.harness;
  const harness = normalizedDescriptor(adapter.descriptor);
  const sessionViews = createAgentSessionViewCache();
  const pendingSessionWarmups = new Set<string>();
  let activeSessionWarmup: OwnedSessionWarmup | null = null;
  let activeShutdown: OwnedDaemonShutdown | null = null;
  let closed = false;

  const warmSession = (activeSessionId: string) =>
    windowAgentSessionFeed(adapter.sessionFeed(activeSessionId)).pipe(
      Stream.takeUntil(
        (item) => item.kind === 'snapshot' || item.kind === 'closed',
      ),
      Stream.runForEach((item) =>
        Effect.sync(() => sessionViews.apply(activeSessionId, item)),
      ),
    );

  const startPendingSessionWarmups = (): void => {
    if (closed || activeSessionWarmup !== null) return;
    const activeSessionIds = [...pendingSessionWarmups].slice(
      0,
      maximumConcurrentWarmups,
    );
    if (activeSessionIds.length === 0) return;
    for (const activeSessionId of activeSessionIds) {
      pendingSessionWarmups.delete(activeSessionId);
    }

    const owner: OwnedSessionWarmup = { fiber: null };
    activeSessionWarmup = owner;
    owner.fiber = Effect.runFork(
      Effect.forEach(activeSessionIds, warmSession, {
        concurrency: maximumConcurrentWarmups,
        discard: true,
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (activeSessionWarmup !== owner) return;
            activeSessionWarmup = null;
            startPendingSessionWarmups();
          }),
        ),
      ),
    );
  };

  const prewarmSessionViews = (workspace: AgentWorkspace): void => {
    for (const session of workspace.sessions.slice(0, maximumPrewarmedSessions)) {
      if (sessionViews.peek(session.activeSessionId) === null) {
        pendingSessionWarmups.add(session.activeSessionId);
      }
    }
    startPendingSessionWarmups();
  };

  const sessionFeed = (activeSessionId: JsonValue) => {
    const sessionId = normalizedSessionId(activeSessionId);
    if (sessionId !== null) pendingSessionWarmups.delete(sessionId);
    const cachedView = sessionId === null ? null : sessionViews.read(sessionId);
    const liveFeed = windowAgentSessionFeed(
      adapter.sessionFeed(activeSessionId),
      cachedView,
    ).pipe(
      Stream.mapEffect((item) =>
        Effect.sync(() => {
          if (sessionId !== null) sessionViews.apply(sessionId, item);
          return item;
        }),
      ),
    );
    if (sessionId === null) return liveFeed;

    return cachedView === null
      ? liveFeed
      : Stream.succeed({
          kind: 'snapshot' as const,
          previousHistoryStart: null,
          view: cachedView,
        }).pipe(
          Stream.concat(liveFeed),
        );
  };
  const workspaceFeed = () =>
    adapter.workspaceFeed().pipe(
      Stream.mapEffect((item) =>
        Effect.sync(() => {
          if (item.kind === 'workspace-replaced') {
            prewarmSessionViews(item.workspace);
          }
          return item;
        }),
      ),
    );

  const loadSessionHistory = Effect.fn('ErnieDaemon.loadSessionHistory')(
    (request: JsonValue): Effect.Effect<AgentResult<AgentSessionHistoryPage>> => {
      const parsed = parsePrimeAgentSessionHistoryRequest(request);
      if (!parsed.ok) return Effect.succeed(parsed);

      return adapter.sessionFeed(parsed.value.activeSessionId).pipe(
        Stream.filter(
          (item): item is Extract<AgentSessionFeedItem, { kind: 'snapshot' }> =>
            item.kind === 'snapshot',
        ),
        Stream.take(1),
        Stream.runCollect,
        Effect.map((items) => {
          const snapshot = Array.from(items)[0];
          if (snapshot === undefined) {
            return {
              ok: false as const,
              error: {
                code: 'daemon_unavailable' as const,
                message: 'Ernie could not load earlier Agent history.',
              },
            };
          }
          return {
            ok: true as const,
            value: agentSessionHistoryPage(
              snapshot.view,
              parsed.value.before,
            ),
          };
        }),
      );
    },
  );
  return Object.freeze({
    harness,
    close(): void {
      if (closed) return;
      closed = true;
      pendingSessionWarmups.clear();
      const warmup = activeSessionWarmup;
      activeSessionWarmup = null;
      const closeAdapter = Effect.sync(() => {
        sessionViews.clear();
        adapter.close();
      });
      if (warmup?.fiber === null || warmup?.fiber === undefined) {
        Effect.runSync(closeAdapter);
        return;
      }
      const shutdown: OwnedDaemonShutdown = { fiber: null };
      activeShutdown = shutdown;
      shutdown.fiber = Effect.runFork(
        Fiber.interrupt(warmup.fiber).pipe(
          Effect.andThen(closeAdapter),
          Effect.ensuring(
            Effect.sync(() => {
              if (activeShutdown === shutdown) activeShutdown = null;
            }),
          ),
        ),
      );
    },
    createSession: adapter.createSession,
    getConfiguration: adapter.getConfiguration,
    getRlmDepth: adapter.getRlmDepth,
    importSession: adapter.importSession,
    listModels: adapter.listModels,
    loadSessionHistory,
    listSavedSessions: adapter.listSavedSessions,
    listSkills: adapter.listSkills,
    listWorkspace: adapter.listWorkspace,
    refineSession: adapter.refineSession,
    renameSession: adapter.renameSession,
    sessionFeed,
    setModel: adapter.setModel,
    setThinkingLevel: adapter.setThinkingLevel,
    setRlmDepth: adapter.setRlmDepth,
    submitTask: adapter.submitTask,
    workspaceFeed,
  });
}
