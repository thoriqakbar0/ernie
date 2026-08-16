import type {
  AgentGitBranchRename,
  AgentGitBranchSelection,
  AgentGitWorktreeCreation,
  AgentModelCatalogScope,
  AgentModelSelection,
  AgentRlmDepthSelection,
  AgentRefinementRequest,
  AgentSessionCreation,
  AgentSessionHistoryRequest,
  AgentSessionRename,
  AgentTaskSubmission,
  AgentThinkingLevelSelection,
} from './packages/ernie-daemon/client.js';
import type { BrowserPluginRendererApi } from './packages/browser-plugin/index.js';
import type { JsonValue } from './packages/json-value/index.js';
import { agentRendererChannels } from './packages/agent-renderer-client/channels.js';

/** IPC channel emitted after the renderer has painted its required surface. */
export const rendererReadyChannel = 'ernie:renderer-ready';

/** IPC channel carrying a requested Ernie color appearance. */
export const colorThemeRequestChannel = 'ernie:color-theme:request';

/** IPC channel carrying a requested Ernie sidebar presentation change. */
export const sidebarControlRequestChannel = 'ernie:sidebar:control-request';

/** IPC channel that describes the harness behind Ernie's daemon API. */
export const agentHarnessChannel = agentRendererChannels.describeHarness;

/** IPC channel that lists live sessions from the Prime Agent daemon. */
export const primeAgentWorkspaceChannel = agentRendererChannels.listWorkspace;

/** IPC channel that starts the daemon-owned workspace feed. */
export const primeAgentWorkspaceFeedStartChannel =
  agentRendererChannels.workspaceFeedStart;

/** IPC channel that stops the daemon-owned workspace feed. */
export const primeAgentWorkspaceFeedStopChannel =
  agentRendererChannels.workspaceFeedStop;

/** IPC channel carrying daemon-owned workspace changes. */
export const primeAgentWorkspaceFeedEventChannel =
  agentRendererChannels.workspaceFeedEvent;

/** IPC channel that creates one fresh Agent session in a workspace. */
export const primeAgentCreateSessionChannel = agentRendererChannels.createSession;

/** IPC channel that lists durable Prime Agent sessions available to import. */
export const primeAgentSavedSessionsChannel = agentRendererChannels.listSavedSessions;

/** IPC channel that reopens one durable Prime Agent session in Ernie. */
export const primeAgentImportSessionChannel = agentRendererChannels.importSession;

/** IPC channel that persists one Agent conversation name. */
export const primeAgentRenameSessionChannel = agentRendererChannels.renameSession;

/** IPC channel that lists configured models for a draft or connected Agent. */
export const primeAgentModelsChannel = agentRendererChannels.listModels;

/** IPC channel that reads one connected Agent's model and reasoning effort. */
export const primeAgentConfigurationChannel = agentRendererChannels.getConfiguration;

/** IPC channel that lists skills available to one Prime Agent session. */
export const primeAgentSkillsChannel = agentRendererChannels.listSkills;

/** IPC channel that starts one focused Agent event feed. */
export const primeAgentSessionFeedStartChannel = agentRendererChannels.sessionFeedStart;

/** IPC channel that stops one focused Agent event feed. */
export const primeAgentSessionFeedStopChannel = agentRendererChannels.sessionFeedStop;

/** IPC channel carrying normalized focused Agent events. */
export const primeAgentSessionFeedEventChannel = agentRendererChannels.sessionFeedEvent;

/** IPC channel that reads one bounded page of earlier Agent history. */
export const primeAgentSessionHistoryChannel = agentRendererChannels.loadSessionHistory;

/** IPC channel that changes the model for one Prime Agent session. */
export const primeAgentSetModelChannel = agentRendererChannels.setModel;

/** IPC channel that changes reasoning effort for one Prime Agent session. */
export const primeAgentSetThinkingLevelChannel = agentRendererChannels.setThinkingLevel;

/** IPC channel that reads RLM maximum depth for one Prime Agent session. */
export const primeAgentRlmDepthChannel = agentRendererChannels.getRlmDepth;

/** IPC channel that changes RLM maximum depth for one Prime Agent session. */
export const primeAgentSetRlmDepthChannel = agentRendererChannels.setRlmDepth;

/** IPC channel that submits one task to a connected Prime Agent session. */
export const primeAgentSubmitTaskChannel = agentRendererChannels.submitTask;

/** IPC channel that refines one connected Prime Agent session. */
export const primeAgentRefineSessionChannel = agentRendererChannels.refineSession;

/** IPC channel that reads local branches for one workspace. */
export const primeAgentGitBranchesChannel = agentRendererChannels.listGitBranches;

/** IPC channel that resolves one workspace to its Git repository identity. */
export const primeAgentGitWorkspaceChannel = agentRendererChannels.readGitWorkspace;

/** IPC channel that switches one workspace to a local branch. */
export const primeAgentSwitchGitBranchChannel = agentRendererChannels.switchGitBranch;

/** IPC channel that deletes one merged local branch. */
export const primeAgentDeleteGitBranchChannel = agentRendererChannels.deleteGitBranch;

/** IPC channel that renames one local branch. */
export const primeAgentRenameGitBranchChannel = agentRendererChannels.renameGitBranch;

/** IPC channel that initializes one local Git repository with main. */
export const primeAgentInitializeGitChannel = agentRendererChannels.initializeGit;

/** IPC channel that creates or reuses one local Git worktree. */
export const primeAgentCreateGitWorktreeChannel = agentRendererChannels.createGitWorktree;

/** IPC channel that opens the native workspace directory picker. */
export const chooseWorkspaceDirectoryChannel = agentRendererChannels.chooseWorkspaceDirectory;

/** IPC channel that reveals a workspace path in Finder. */
export const revealWorkspacePathChannel = 'ernie:workspace:reveal-path';

/** Minimal preload API exposed to the isolated renderer context. */
export type ErnieRendererApi = Readonly<{
  signalReady: () => void;
  onColorThemeRequest: (listener: (value: JsonValue) => void) => () => void;
  onSidebarControlRequest: (
    listener: (value: JsonValue) => void,
  ) => () => void;
  describeAgentHarness: () => Promise<JsonValue>;
  listAgentWorkspace: () => Promise<JsonValue>;
  watchAgentWorkspace: (listener: (value: JsonValue) => void) => string;
  unwatchAgentWorkspace: (subscriptionId: string) => void;
  createAgentSession: (
    creation: AgentSessionCreation,
  ) => Promise<JsonValue>;
  listAgentSavedSessions: () => Promise<JsonValue>;
  importAgentSession: (sessionPath: string) => Promise<JsonValue>;
  renameAgentSession: (rename: AgentSessionRename) => Promise<JsonValue>;
  /** List usable models for a draft or connected Agent as a serialized result. */
  listAgentModels: (scope: AgentModelCatalogScope) => Promise<JsonValue>;
  /** Read a connected Agent's model configuration as a serialized result. */
  getAgentConfiguration: (activeSessionId: string) => Promise<JsonValue>;
  listAgentSkills: (activeSessionId: string) => Promise<JsonValue>;
  watchAgentSession: (
    activeSessionId: string,
    listener: (value: JsonValue) => void,
  ) => string;
  unwatchAgentSession: (subscriptionId: string) => void;
  /** Load one bounded transcript page before the requested history index. */
  loadAgentSessionHistory: (
    request: AgentSessionHistoryRequest,
  ) => Promise<JsonValue>;
  /** Change a connected Agent's model and resolve its applied configuration. */
  setAgentModel: (selection: AgentModelSelection) => Promise<JsonValue>;
  /** Change reasoning effort and resolve the connected Agent's applied configuration. */
  setAgentThinkingLevel: (
    selection: AgentThinkingLevelSelection,
  ) => Promise<JsonValue>;
  getAgentRlmDepth: (activeSessionId: string) => Promise<JsonValue>;
  setAgentRlmDepth: (
    selection: AgentRlmDepthSelection,
  ) => Promise<JsonValue>;
  submitAgentTask: (
    submission: AgentTaskSubmission,
  ) => Promise<JsonValue>;
  refineAgentSession: (
    request: AgentRefinementRequest,
  ) => Promise<JsonValue>;
  listGitBranches: (cwd: string) => Promise<JsonValue>;
  readGitWorkspace: (cwd: string) => Promise<JsonValue>;
  switchGitBranch: (
    selection: AgentGitBranchSelection,
  ) => Promise<JsonValue>;
  deleteGitBranch: (
    selection: AgentGitBranchSelection,
  ) => Promise<JsonValue>;
  renameGitBranch: (
    rename: AgentGitBranchRename,
  ) => Promise<JsonValue>;
  initializeGit: (cwd: string) => Promise<JsonValue>;
  createGitWorktree: (
    creation: AgentGitWorktreeCreation,
  ) => Promise<JsonValue>;
  chooseWorkspaceDirectory: () => Promise<JsonValue>;
  revealWorkspacePath: (workspacePath: string) => Promise<JsonValue>;
  acquireBrowserPlugin: BrowserPluginRendererApi['acquireBrowserPlugin'];
  releaseBrowserPlugin: BrowserPluginRendererApi['releaseBrowserPlugin'];
  showBrowserPlugin: BrowserPluginRendererApi['showBrowserPlugin'];
  hideBrowserPlugin: BrowserPluginRendererApi['hideBrowserPlugin'];
  navigateBrowserPlugin: BrowserPluginRendererApi['navigateBrowserPlugin'];
  goBackBrowserPlugin: BrowserPluginRendererApi['goBackBrowserPlugin'];
  goForwardBrowserPlugin: BrowserPluginRendererApi['goForwardBrowserPlugin'];
  reloadBrowserPlugin: BrowserPluginRendererApi['reloadBrowserPlugin'];
  onBrowserPluginState: BrowserPluginRendererApi['onBrowserPluginState'];
}>;

declare global {
  interface Window {
    readonly ernie: ErnieRendererApi;
  }
}
