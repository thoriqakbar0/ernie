import type { Effect, Stream } from 'effect';
import type { JsonValue } from '../json-value/index.js';
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
export interface AgentHarness {
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

/** Ernie's immutable daemon API with one selected harness adapter. */
export interface ErnieDaemon extends AgentHarness {
  readonly harness: AgentHarnessDescriptor;
}

/** Configuration that installs one harness behind Ernie's daemon API. */
export interface ErnieDaemonConfiguration {
  readonly harness: AgentHarness;
  readonly descriptor: AgentHarnessDescriptor;
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

/** Install one runtime adapter behind Ernie's stable daemon boundary. */
export function createErnieDaemon(
  configuration: ErnieDaemonConfiguration,
): ErnieDaemon {
  const harness = normalizedDescriptor(configuration.descriptor);
  const adapter = configuration.harness;
  return Object.freeze({
    harness,
    close: adapter.close,
    createSession: adapter.createSession,
    getRlmDepth: adapter.getRlmDepth,
    importSession: adapter.importSession,
    listModels: adapter.listModels,
    listSavedSessions: adapter.listSavedSessions,
    listSkills: adapter.listSkills,
    listWorkspace: adapter.listWorkspace,
    refineSession: adapter.refineSession,
    renameSession: adapter.renameSession,
    sessionFeed: adapter.sessionFeed,
    setModel: adapter.setModel,
    setRlmDepth: adapter.setRlmDepth,
    submitTask: adapter.submitTask,
  });
}
