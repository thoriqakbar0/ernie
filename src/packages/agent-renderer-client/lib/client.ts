import {
  isJsonRecord,
  isJsonString,
  type JsonValue,
} from '../../json-value/index.js';
import type { AgentHarnessDescriptor } from '../../ernie-daemon/index.js';
import {
  parsePrimeAgentConfigurationResult,
  parsePrimeAgentModelsResult,
  parsePrimeAgentRefinementReceiptResult,
  parsePrimeAgentRlmDepthResult,
  parsePrimeAgentSavedSessionsResult,
  parsePrimeAgentSessionHistoryPageResult,
  parsePrimeAgentSessionRenameResult,
  parsePrimeAgentSessionResult,
  parsePrimeAgentSkillsResult,
  parsePrimeAgentTaskReceiptResult,
  parsePrimeAgentWorkspaceResult,
} from '../../prime-agent-daemon/client.js';
import {
  parsePrimeAgentSessionFeedEnvelope,
  parsePrimeAgentWorkspaceFeedItem,
} from '../../prime-agent-daemon/events.js';
import {
  parsePrimeAgentGitBranchesResult,
  parsePrimeAgentGitWorkspaceResult,
  parsePrimeAgentGitWorktreeResult,
} from '../../prime-agent-daemon/git-client.js';
import type {
  PrimeAgentConfiguration,
  PrimeAgentGitBranchRename,
  PrimeAgentGitBranchSelection,
  PrimeAgentGitBranches,
  PrimeAgentGitWorkspace,
  PrimeAgentGitWorktree,
  PrimeAgentGitWorktreeCreation,
  PrimeAgentModel,
  PrimeAgentModelCatalogScope,
  PrimeAgentModelSelection,
  PrimeAgentRefinementReceipt,
  PrimeAgentRefinementRequest,
  PrimeAgentResult,
  PrimeAgentRlmDepth,
  PrimeAgentRlmDepthSelection,
  PrimeAgentSavedSession,
  PrimeAgentSession,
  PrimeAgentSessionCreation,
  PrimeAgentSessionFeedEnvelope,
  PrimeAgentSessionHistoryPage,
  PrimeAgentSessionHistoryRequest,
  PrimeAgentSessionRename,
  PrimeAgentSessionRenameReceipt,
  PrimeAgentSkill,
  PrimeAgentTaskReceipt,
  PrimeAgentTaskSubmission,
  PrimeAgentThinkingLevelSelection,
  PrimeAgentWorkspaceFeedItem,
  PrimeAgentWorkspace,
} from '../../prime-agent-daemon/types.js';

/** Raw harness discovery operations exposed by Electron's preload. */
export interface AgentHarnessRendererTransport {
  readonly describeAgentHarness: () => Promise<JsonValue>;
  readonly listAgentWorkspace: () => Promise<JsonValue>;
}

/** Raw feed operations exposed by Electron's preload. */
export interface AgentFeedRendererTransport {
  readonly watchAgentWorkspace: (
    listener: (value: JsonValue) => void,
  ) => string;
  readonly unwatchAgentWorkspace: (subscriptionId: string) => void;
  readonly watchAgentSession: (
    activeSessionId: string,
    listener: (value: JsonValue) => void,
  ) => string;
  readonly unwatchAgentSession: (subscriptionId: string) => void;
}

/** Raw Prime Agent request operations exposed by Electron's preload. */
export interface AgentRequestRendererTransport {
  readonly createAgentSession: (
    creation: PrimeAgentSessionCreation,
  ) => Promise<JsonValue>;
  readonly listAgentSavedSessions: () => Promise<JsonValue>;
  readonly importAgentSession: (sessionPath: string) => Promise<JsonValue>;
  readonly renameAgentSession: (
    rename: PrimeAgentSessionRename,
  ) => Promise<JsonValue>;
  readonly listAgentModels: (
    scope: PrimeAgentModelCatalogScope,
  ) => Promise<JsonValue>;
  readonly getAgentConfiguration: (
    activeSessionId: string,
  ) => Promise<JsonValue>;
  readonly listAgentSkills: (activeSessionId: string) => Promise<JsonValue>;
  readonly loadAgentSessionHistory: (
    request: PrimeAgentSessionHistoryRequest,
  ) => Promise<JsonValue>;
  readonly setAgentModel: (
    selection: PrimeAgentModelSelection,
  ) => Promise<JsonValue>;
  readonly setAgentThinkingLevel: (
    selection: PrimeAgentThinkingLevelSelection,
  ) => Promise<JsonValue>;
  readonly getAgentRlmDepth: (activeSessionId: string) => Promise<JsonValue>;
  readonly setAgentRlmDepth: (
    selection: PrimeAgentRlmDepthSelection,
  ) => Promise<JsonValue>;
  readonly submitAgentTask: (
    submission: PrimeAgentTaskSubmission,
  ) => Promise<JsonValue>;
  readonly refineAgentSession: (
    request: PrimeAgentRefinementRequest,
  ) => Promise<JsonValue>;
}

/** Raw local workspace operations exposed by Electron's preload. */
export interface LocalWorkspaceRendererTransport {
  readonly listGitBranches: (cwd: string) => Promise<JsonValue>;
  readonly readGitWorkspace: (cwd: string) => Promise<JsonValue>;
  readonly switchGitBranch: (
    selection: PrimeAgentGitBranchSelection,
  ) => Promise<JsonValue>;
  readonly deleteGitBranch: (
    selection: PrimeAgentGitBranchSelection,
  ) => Promise<JsonValue>;
  readonly renameGitBranch: (
    rename: PrimeAgentGitBranchRename,
  ) => Promise<JsonValue>;
  readonly initializeGit: (cwd: string) => Promise<JsonValue>;
  readonly createGitWorktree: (
    creation: PrimeAgentGitWorktreeCreation,
  ) => Promise<JsonValue>;
  readonly chooseWorkspaceDirectory: () => Promise<JsonValue>;
}

/** Narrow preload capabilities used to construct renderer clients. */
export interface AgentRendererTransportConfiguration {
  readonly feeds: AgentFeedRendererTransport;
  readonly harness: AgentHarnessRendererTransport;
  readonly localWorkspace: LocalWorkspaceRendererTransport;
  readonly requests: AgentRequestRendererTransport;
}

/** One active renderer feed with exact, idempotent cleanup. */
export interface AgentRendererSubscription {
  readonly id: string;
  readonly close: () => void;
}

/** Parsed Prime Agent operations available to renderer state adapters. */
export interface PrimeAgentRendererClient {
  readonly describeHarness: () => Promise<PrimeAgentResult<AgentHarnessDescriptor>>;
  readonly listWorkspace: () => Promise<PrimeAgentResult<PrimeAgentWorkspace>>;
  readonly watchWorkspace: (
    listener: (
      result: PrimeAgentResult<PrimeAgentWorkspaceFeedItem>,
    ) => void,
  ) => AgentRendererSubscription;
  readonly watchSession: (
    activeSessionId: string,
    listener: (
      result: PrimeAgentResult<PrimeAgentSessionFeedEnvelope>,
    ) => void,
  ) => AgentRendererSubscription;
  readonly createSession: (
    creation: PrimeAgentSessionCreation,
  ) => Promise<PrimeAgentResult<PrimeAgentSession>>;
  readonly listSavedSessions: () => Promise<
    PrimeAgentResult<readonly PrimeAgentSavedSession[]>
  >;
  readonly importSession: (
    sessionPath: string,
  ) => Promise<PrimeAgentResult<PrimeAgentSession>>;
  readonly renameSession: (
    rename: PrimeAgentSessionRename,
  ) => Promise<PrimeAgentResult<PrimeAgentSessionRenameReceipt>>;
  readonly listModels: (
    scope: PrimeAgentModelCatalogScope,
  ) => Promise<PrimeAgentResult<readonly PrimeAgentModel[]>>;
  readonly getConfiguration: (
    activeSessionId: string,
  ) => Promise<PrimeAgentResult<PrimeAgentConfiguration>>;
  readonly listSkills: (
    activeSessionId: string,
  ) => Promise<PrimeAgentResult<readonly PrimeAgentSkill[]>>;
  readonly loadHistory: (
    request: PrimeAgentSessionHistoryRequest,
  ) => Promise<PrimeAgentResult<PrimeAgentSessionHistoryPage>>;
  readonly setModel: (
    selection: PrimeAgentModelSelection,
  ) => Promise<PrimeAgentResult<PrimeAgentConfiguration>>;
  readonly setThinkingLevel: (
    selection: PrimeAgentThinkingLevelSelection,
  ) => Promise<PrimeAgentResult<PrimeAgentConfiguration>>;
  readonly getRlmDepth: (
    activeSessionId: string,
  ) => Promise<PrimeAgentResult<PrimeAgentRlmDepth>>;
  readonly setRlmDepth: (
    selection: PrimeAgentRlmDepthSelection,
  ) => Promise<PrimeAgentResult<PrimeAgentRlmDepth>>;
  readonly submitTask: (
    submission: PrimeAgentTaskSubmission,
  ) => Promise<PrimeAgentResult<PrimeAgentTaskReceipt>>;
  readonly refineSession: (
    request: PrimeAgentRefinementRequest,
  ) => Promise<PrimeAgentResult<PrimeAgentRefinementReceipt>>;
}

/** Parsed result of the native workspace-directory picker. */
export type WorkspaceDirectorySelection =
  | Readonly<{ ok: true; value: string | null }>
  | Readonly<{ ok: false }>;

/** Parsed local workspace operations available to renderer state adapters. */
export interface LocalWorkspaceRendererClient {
  readonly listBranches: (
    cwd: string,
  ) => Promise<PrimeAgentResult<PrimeAgentGitBranches>>;
  readonly readWorkspace: (
    cwd: string,
  ) => Promise<PrimeAgentResult<PrimeAgentGitWorkspace>>;
  readonly switchBranch: (
    selection: PrimeAgentGitBranchSelection,
  ) => Promise<PrimeAgentResult<PrimeAgentGitBranches>>;
  readonly deleteBranch: (
    selection: PrimeAgentGitBranchSelection,
  ) => Promise<PrimeAgentResult<PrimeAgentGitBranches>>;
  readonly renameBranch: (
    rename: PrimeAgentGitBranchRename,
  ) => Promise<PrimeAgentResult<PrimeAgentGitBranches>>;
  readonly initializeGit: (
    cwd: string,
  ) => Promise<PrimeAgentResult<PrimeAgentGitBranches>>;
  readonly createWorktree: (
    creation: PrimeAgentGitWorktreeCreation,
  ) => Promise<PrimeAgentResult<PrimeAgentGitWorktree>>;
  readonly chooseDirectory: () => Promise<WorkspaceDirectorySelection>;
}

/** Typed renderer clients projected from Electron's raw preload transport. */
export interface AgentRendererClients {
  readonly agent: PrimeAgentRendererClient;
  readonly localWorkspace: LocalWorkspaceRendererClient;
}

function createSubscription(
  id: string,
  stop: (subscriptionId: string) => void,
): AgentRendererSubscription {
  let active = true;
  return {
    id,
    close: () => {
      if (!active) return;
      active = false;
      stop(id);
    },
  };
}

function parseDirectorySelection(value: JsonValue): WorkspaceDirectorySelection {
  if (value === null) return { ok: true, value: null };
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The preload boundary accepts one non-empty string primitive.
  if (typeof value === 'string' && value.trim().length > 0) {
    return { ok: true, value };
  }
  return { ok: false };
}

const harnessCapabilities = [
  'live-sessions',
  'saved-sessions',
  'models',
  'thinking-level',
  'skills',
  'rlm-depth',
  'refinement',
] as const satisfies readonly AgentHarnessDescriptor['capabilities'][number][];

function parseHarnessDescriptor(
  value: JsonValue,
): PrimeAgentResult<AgentHarnessDescriptor> {
  if (
    !isJsonRecord(value) ||
    !isJsonString(value.id) ||
    value.id.trim().length === 0 ||
    !isJsonString(value.name) ||
    value.name.trim().length === 0 ||
    !Array.isArray(value.capabilities) ||
    !value.capabilities.every(
      (capability): capability is AgentHarnessDescriptor['capabilities'][number] =>
        isJsonString(capability) &&
        harnessCapabilities.some((candidate) => candidate === capability),
    )
  ) {
    return {
      ok: false,
      error: {
        code: 'protocol_error',
        message: 'The Agent harness descriptor was invalid.',
      },
    };
  }
  return {
    ok: true,
    value: {
      capabilities: value.capabilities,
      id: value.id,
      name: value.name,
    },
  };
}

/** Parse all Agent and local workspace values at the renderer transport edge. */
export function createAgentRendererClients(
  configuration: AgentRendererTransportConfiguration,
): AgentRendererClients {
  const { feeds, harness, localWorkspace, requests } = configuration;
  return {
    agent: {
      describeHarness: async () =>
        parseHarnessDescriptor(await harness.describeAgentHarness()),
      listWorkspace: async () =>
        parsePrimeAgentWorkspaceResult(await harness.listAgentWorkspace()),
      watchWorkspace: (listener) => {
        let active = true;
        const id = feeds.watchAgentWorkspace((value) => {
          if (active) listener(parsePrimeAgentWorkspaceFeedItem(value));
        });
        const subscription = createSubscription(id, (subscriptionId) => {
          active = false;
          feeds.unwatchAgentWorkspace(subscriptionId);
        });
        return subscription;
      },
      watchSession: (activeSessionId, listener) => {
        let active = true;
        const id = feeds.watchAgentSession(activeSessionId, (value) => {
          if (active) listener(parsePrimeAgentSessionFeedEnvelope(value));
        });
        return createSubscription(id, (subscriptionId) => {
          active = false;
          feeds.unwatchAgentSession(subscriptionId);
        });
      },
      createSession: async (creation) =>
        parsePrimeAgentSessionResult(
          await requests.createAgentSession(creation),
        ),
      listSavedSessions: async () =>
        parsePrimeAgentSavedSessionsResult(
          await requests.listAgentSavedSessions(),
        ),
      importSession: async (sessionPath) =>
        parsePrimeAgentSessionResult(
          await requests.importAgentSession(sessionPath),
        ),
      renameSession: async (rename) =>
        parsePrimeAgentSessionRenameResult(
          await requests.renameAgentSession(rename),
        ),
      listModels: async (scope) =>
        parsePrimeAgentModelsResult(await requests.listAgentModels(scope)),
      getConfiguration: async (activeSessionId) =>
        parsePrimeAgentConfigurationResult(
          await requests.getAgentConfiguration(activeSessionId),
        ),
      listSkills: async (activeSessionId) =>
        parsePrimeAgentSkillsResult(
          await requests.listAgentSkills(activeSessionId),
        ),
      loadHistory: async (request) =>
        parsePrimeAgentSessionHistoryPageResult(
          await requests.loadAgentSessionHistory(request),
        ),
      setModel: async (selection) =>
        parsePrimeAgentConfigurationResult(
          await requests.setAgentModel(selection),
        ),
      setThinkingLevel: async (selection) =>
        parsePrimeAgentConfigurationResult(
          await requests.setAgentThinkingLevel(selection),
        ),
      getRlmDepth: async (activeSessionId) =>
        parsePrimeAgentRlmDepthResult(
          await requests.getAgentRlmDepth(activeSessionId),
        ),
      setRlmDepth: async (selection) =>
        parsePrimeAgentRlmDepthResult(
          await requests.setAgentRlmDepth(selection),
        ),
      submitTask: async (submission) =>
        parsePrimeAgentTaskReceiptResult(
          await requests.submitAgentTask(submission),
        ),
      refineSession: async (request) =>
        parsePrimeAgentRefinementReceiptResult(
          await requests.refineAgentSession(request),
        ),
    },
    localWorkspace: {
      listBranches: async (cwd) =>
        parsePrimeAgentGitBranchesResult(
          await localWorkspace.listGitBranches(cwd),
        ),
      readWorkspace: async (cwd) =>
        parsePrimeAgentGitWorkspaceResult(
          await localWorkspace.readGitWorkspace(cwd),
        ),
      switchBranch: async (selection) =>
        parsePrimeAgentGitBranchesResult(
          await localWorkspace.switchGitBranch(selection),
        ),
      deleteBranch: async (selection) =>
        parsePrimeAgentGitBranchesResult(
          await localWorkspace.deleteGitBranch(selection),
        ),
      renameBranch: async (rename) =>
        parsePrimeAgentGitBranchesResult(
          await localWorkspace.renameGitBranch(rename),
        ),
      initializeGit: async (cwd) =>
        parsePrimeAgentGitBranchesResult(await localWorkspace.initializeGit(cwd)),
      createWorktree: async (creation) =>
        parsePrimeAgentGitWorktreeResult(
          await localWorkspace.createGitWorktree(creation),
        ),
      chooseDirectory: async () =>
        parseDirectorySelection(await localWorkspace.chooseWorkspaceDirectory()),
    },
  };
}
