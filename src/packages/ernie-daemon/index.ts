import { Effect, Stream } from 'effect';
import { isJsonString, type JsonValue } from '../json-value/index.js';
import { createAgentSessionViewCache } from './lib/session-view-cache.js';
import type {
  AgentModel,
  AgentRefinementReceipt,
  AgentResult,
  AgentRlmDepth,
  AgentSavedSession,
  AgentSession,
  AgentSessionFeedItem,
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
    activeSessionId: JsonValue,
  ) => Effect.Effect<AgentResult<readonly AgentModel[]>>;
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
  ) => Effect.Effect<AgentResult<AgentModel>>;
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
}

/** Configuration that installs one harness behind Ernie's daemon API. */
export interface ErnieDaemonConfiguration {
  readonly harness: AgentHarnessAdapter;
}

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
  const sessionFeed = (activeSessionId: JsonValue) => {
    const sessionId = normalizedSessionId(activeSessionId);
    const liveFeed = adapter.sessionFeed(activeSessionId).pipe(
      Stream.mapEffect((item) =>
        Effect.sync(() => {
          if (sessionId !== null) sessionViews.apply(sessionId, item);
          return item;
        }),
      ),
    );
    if (sessionId === null) return liveFeed;

    const cachedView = sessionViews.read(sessionId);
    return cachedView === null
      ? liveFeed
      : Stream.succeed({ kind: 'snapshot' as const, view: cachedView }).pipe(
          Stream.concat(liveFeed),
        );
  };
  return Object.freeze({
    harness,
    close(): void {
      sessionViews.clear();
      adapter.close();
    },
    createSession: adapter.createSession,
    getRlmDepth: adapter.getRlmDepth,
    importSession: adapter.importSession,
    listModels: adapter.listModels,
    listSavedSessions: adapter.listSavedSessions,
    listSkills: adapter.listSkills,
    listWorkspace: adapter.listWorkspace,
    refineSession: adapter.refineSession,
    renameSession: adapter.renameSession,
    sessionFeed,
    setModel: adapter.setModel,
    setRlmDepth: adapter.setRlmDepth,
    submitTask: adapter.submitTask,
    workspaceFeed: adapter.workspaceFeed,
  });
}
