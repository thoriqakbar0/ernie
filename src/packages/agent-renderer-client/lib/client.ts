import type { JsonValue } from '../../json-value/index.js';
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
} from '../../prime-agent-daemon/types.js';

/** Raw preload operations used by the typed renderer clients. */
export interface AgentRendererTransport {
  readonly watchAgentWorkspace: (
    listener: (value: JsonValue) => void,
  ) => string;
  readonly unwatchAgentWorkspace: (subscriptionId: string) => void;
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
  readonly watchAgentSession: (
    activeSessionId: string,
    listener: (value: JsonValue) => void,
  ) => string;
  readonly unwatchAgentSession: (subscriptionId: string) => void;
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

/** One active renderer feed with exact, idempotent cleanup. */
export interface AgentRendererSubscription {
  readonly id: string;
  readonly close: () => void;
}

/** Parsed Prime Agent operations available to renderer state adapters. */
export interface PrimeAgentRendererClient {
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

/** Parse all Agent and local workspace values at the renderer transport edge. */
export function createAgentRendererClients(
  transport: AgentRendererTransport,
): AgentRendererClients {
  return {
    agent: {
      watchWorkspace: (listener) => {
        let active = true;
        const id = transport.watchAgentWorkspace((value) => {
          if (active) listener(parsePrimeAgentWorkspaceFeedItem(value));
        });
        const subscription = createSubscription(id, (subscriptionId) => {
          active = false;
          transport.unwatchAgentWorkspace(subscriptionId);
        });
        return subscription;
      },
      watchSession: (activeSessionId, listener) => {
        let active = true;
        const id = transport.watchAgentSession(activeSessionId, (value) => {
          if (active) listener(parsePrimeAgentSessionFeedEnvelope(value));
        });
        return createSubscription(id, (subscriptionId) => {
          active = false;
          transport.unwatchAgentSession(subscriptionId);
        });
      },
      createSession: async (creation) =>
        parsePrimeAgentSessionResult(
          await transport.createAgentSession(creation),
        ),
      listSavedSessions: async () =>
        parsePrimeAgentSavedSessionsResult(
          await transport.listAgentSavedSessions(),
        ),
      importSession: async (sessionPath) =>
        parsePrimeAgentSessionResult(
          await transport.importAgentSession(sessionPath),
        ),
      renameSession: async (rename) =>
        parsePrimeAgentSessionRenameResult(
          await transport.renameAgentSession(rename),
        ),
      listModels: async (scope) =>
        parsePrimeAgentModelsResult(await transport.listAgentModels(scope)),
      getConfiguration: async (activeSessionId) =>
        parsePrimeAgentConfigurationResult(
          await transport.getAgentConfiguration(activeSessionId),
        ),
      listSkills: async (activeSessionId) =>
        parsePrimeAgentSkillsResult(
          await transport.listAgentSkills(activeSessionId),
        ),
      loadHistory: async (request) =>
        parsePrimeAgentSessionHistoryPageResult(
          await transport.loadAgentSessionHistory(request),
        ),
      setModel: async (selection) =>
        parsePrimeAgentConfigurationResult(
          await transport.setAgentModel(selection),
        ),
      setThinkingLevel: async (selection) =>
        parsePrimeAgentConfigurationResult(
          await transport.setAgentThinkingLevel(selection),
        ),
      getRlmDepth: async (activeSessionId) =>
        parsePrimeAgentRlmDepthResult(
          await transport.getAgentRlmDepth(activeSessionId),
        ),
      setRlmDepth: async (selection) =>
        parsePrimeAgentRlmDepthResult(
          await transport.setAgentRlmDepth(selection),
        ),
      submitTask: async (submission) =>
        parsePrimeAgentTaskReceiptResult(
          await transport.submitAgentTask(submission),
        ),
      refineSession: async (request) =>
        parsePrimeAgentRefinementReceiptResult(
          await transport.refineAgentSession(request),
        ),
    },
    localWorkspace: {
      listBranches: async (cwd) =>
        parsePrimeAgentGitBranchesResult(
          await transport.listGitBranches(cwd),
        ),
      readWorkspace: async (cwd) =>
        parsePrimeAgentGitWorkspaceResult(
          await transport.readGitWorkspace(cwd),
        ),
      switchBranch: async (selection) =>
        parsePrimeAgentGitBranchesResult(
          await transport.switchGitBranch(selection),
        ),
      deleteBranch: async (selection) =>
        parsePrimeAgentGitBranchesResult(
          await transport.deleteGitBranch(selection),
        ),
      renameBranch: async (rename) =>
        parsePrimeAgentGitBranchesResult(
          await transport.renameGitBranch(rename),
        ),
      initializeGit: async (cwd) =>
        parsePrimeAgentGitBranchesResult(await transport.initializeGit(cwd)),
      createWorktree: async (creation) =>
        parsePrimeAgentGitWorktreeResult(
          await transport.createGitWorktree(creation),
        ),
      chooseDirectory: async () =>
        parseDirectorySelection(await transport.chooseWorkspaceDirectory()),
    },
  };
}
