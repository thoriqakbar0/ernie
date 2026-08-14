import type {
  AgentGitBranchRename,
  AgentGitBranchSelection,
  AgentGitWorktreeCreation,
  AgentModelSelection,
  AgentRlmDepthSelection,
  AgentRefinementRequest,
  AgentSessionCreation,
  AgentSessionRename,
  AgentTaskSubmission,
} from './packages/ernie-daemon/client.js';
import type { BrowserPluginRendererApi } from './packages/browser-plugin/index.js';
import type { JsonValue } from './packages/json-value/index.js';

/** IPC channel emitted after the renderer has painted its required surface. */
export const rendererReadyChannel = 'ernie:renderer-ready';

/** IPC channel carrying a requested Ernie color appearance. */
export const colorThemeRequestChannel = 'ernie:color-theme:request';

/** IPC channel that describes the harness behind Ernie's daemon API. */
export const agentHarnessChannel = 'ernie:daemon:harness';

/** IPC channel that lists live sessions from the Prime Agent daemon. */
export const primeAgentWorkspaceChannel = 'ernie:prime-agent:workspace';

/** IPC channel that starts the daemon-owned workspace feed. */
export const primeAgentWorkspaceFeedStartChannel =
  'ernie:prime-agent:workspace-feed:start';

/** IPC channel that stops the daemon-owned workspace feed. */
export const primeAgentWorkspaceFeedStopChannel =
  'ernie:prime-agent:workspace-feed:stop';

/** IPC channel carrying daemon-owned workspace changes. */
export const primeAgentWorkspaceFeedEventChannel =
  'ernie:prime-agent:workspace-feed:event';

/** IPC channel that creates one fresh Agent session in a workspace. */
export const primeAgentCreateSessionChannel = 'ernie:prime-agent:create-session';

/** IPC channel that lists durable Prime Agent sessions available to import. */
export const primeAgentSavedSessionsChannel =
  'ernie:prime-agent:saved-sessions';

/** IPC channel that reopens one durable Prime Agent session in Ernie. */
export const primeAgentImportSessionChannel =
  'ernie:prime-agent:import-session';

/** IPC channel that persists one Agent conversation name. */
export const primeAgentRenameSessionChannel =
  'ernie:prime-agent:rename-session';

/** IPC channel that lists configured models for one Prime Agent session. */
export const primeAgentModelsChannel = 'ernie:prime-agent:models';

/** IPC channel that lists skills available to one Prime Agent session. */
export const primeAgentSkillsChannel = 'ernie:prime-agent:skills';

/** IPC channel that starts one focused Agent event feed. */
export const primeAgentSessionFeedStartChannel =
  'ernie:prime-agent:session-feed:start';

/** IPC channel that stops one focused Agent event feed. */
export const primeAgentSessionFeedStopChannel =
  'ernie:prime-agent:session-feed:stop';

/** IPC channel carrying normalized focused Agent events. */
export const primeAgentSessionFeedEventChannel =
  'ernie:prime-agent:session-feed:event';

/** IPC channel that changes the model for one Prime Agent session. */
export const primeAgentSetModelChannel = 'ernie:prime-agent:set-model';

/** IPC channel that reads RLM maximum depth for one Prime Agent session. */
export const primeAgentRlmDepthChannel = 'ernie:prime-agent:rlm-depth';

/** IPC channel that changes RLM maximum depth for one Prime Agent session. */
export const primeAgentSetRlmDepthChannel = 'ernie:prime-agent:set-rlm-depth';

/** IPC channel that submits one task to a connected Prime Agent session. */
export const primeAgentSubmitTaskChannel = 'ernie:prime-agent:submit-task';

/** IPC channel that refines one connected Prime Agent session. */
export const primeAgentRefineSessionChannel =
  'ernie:prime-agent:refine-session';

/** IPC channel that reads local branches for one workspace. */
export const primeAgentGitBranchesChannel = 'ernie:prime-agent:git-branches';

/** IPC channel that resolves one workspace to its Git repository identity. */
export const primeAgentGitWorkspaceChannel = 'ernie:prime-agent:git-workspace';

/** IPC channel that switches one workspace to a local branch. */
export const primeAgentSwitchGitBranchChannel =
  'ernie:prime-agent:switch-git-branch';

/** IPC channel that deletes one merged local branch. */
export const primeAgentDeleteGitBranchChannel =
  'ernie:prime-agent:delete-git-branch';

/** IPC channel that renames one local branch. */
export const primeAgentRenameGitBranchChannel =
  'ernie:prime-agent:rename-git-branch';

/** IPC channel that initializes one local Git repository with main. */
export const primeAgentInitializeGitChannel =
  'ernie:prime-agent:initialize-git';

/** IPC channel that creates or reuses one local Git worktree. */
export const primeAgentCreateGitWorktreeChannel =
  'ernie:prime-agent:create-git-worktree';

/** IPC channel that opens the native workspace directory picker. */
export const chooseWorkspaceDirectoryChannel =
  'ernie:workspace:choose-directory';

/** IPC channel that reveals a workspace path in Finder. */
export const revealWorkspacePathChannel = 'ernie:workspace:reveal-path';

/** Minimal preload API exposed to the isolated renderer context. */
export type ErnieRendererApi = Readonly<{
  signalReady: () => void;
  onColorThemeRequest: (listener: (value: JsonValue) => void) => () => void;
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
  listAgentModels: (activeSessionId: string) => Promise<JsonValue>;
  listAgentSkills: (activeSessionId: string) => Promise<JsonValue>;
  watchAgentSession: (
    activeSessionId: string,
    listener: (value: JsonValue) => void,
  ) => string;
  unwatchAgentSession: (subscriptionId: string) => void;
  setAgentModel: (selection: AgentModelSelection) => Promise<JsonValue>;
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
