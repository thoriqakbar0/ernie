import type {
  PrimeAgentGitBranchRename,
  PrimeAgentGitBranchSelection,
  PrimeAgentGitWorktreeCreation,
  PrimeAgentModelSelection,
  PrimeAgentRlmDepthSelection,
  PrimeAgentSessionCreation,
  PrimeAgentSessionRename,
  PrimeAgentTaskSubmission,
} from './packages/prime-agent-daemon/types';

/** IPC channel emitted after the renderer has painted its required surface. */
export const rendererReadyChannel = 'ernie:renderer-ready';

/** IPC channel that lists live sessions from the Prime Agent daemon. */
export const primeAgentWorkspaceChannel = 'ernie:prime-agent:workspace';

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

/** IPC channel that reads one focused Agent chat snapshot. */
export const primeAgentSessionViewChannel = 'ernie:prime-agent:session-view';

/** IPC channel that changes the model for one Prime Agent session. */
export const primeAgentSetModelChannel = 'ernie:prime-agent:set-model';

/** IPC channel that reads RLM maximum depth for one Prime Agent session. */
export const primeAgentRlmDepthChannel = 'ernie:prime-agent:rlm-depth';

/** IPC channel that changes RLM maximum depth for one Prime Agent session. */
export const primeAgentSetRlmDepthChannel = 'ernie:prime-agent:set-rlm-depth';

/** IPC channel that submits one task to a connected Prime Agent session. */
export const primeAgentSubmitTaskChannel = 'ernie:prime-agent:submit-task';

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
  listPrimeAgentWorkspace: () => Promise<unknown>;
  createPrimeAgentSession: (
    creation: PrimeAgentSessionCreation,
  ) => Promise<unknown>;
  listPrimeAgentSavedSessions: () => Promise<unknown>;
  importPrimeAgentSession: (sessionPath: string) => Promise<unknown>;
  renamePrimeAgentSession: (rename: PrimeAgentSessionRename) => Promise<unknown>;
  listPrimeAgentModels: (activeSessionId: string) => Promise<unknown>;
  listPrimeAgentSkills: (activeSessionId: string) => Promise<unknown>;
  getPrimeAgentSessionView?: (activeSessionId: string) => Promise<unknown>;
  setPrimeAgentModel: (selection: PrimeAgentModelSelection) => Promise<unknown>;
  getPrimeAgentRlmDepth: (activeSessionId: string) => Promise<unknown>;
  setPrimeAgentRlmDepth: (
    selection: PrimeAgentRlmDepthSelection,
  ) => Promise<unknown>;
  submitPrimeAgentTask: (
    submission: PrimeAgentTaskSubmission,
  ) => Promise<unknown>;
  listPrimeAgentGitBranches: (cwd: string) => Promise<unknown>;
  readPrimeAgentGitWorkspace: (cwd: string) => Promise<unknown>;
  switchPrimeAgentGitBranch: (
    selection: PrimeAgentGitBranchSelection,
  ) => Promise<unknown>;
  deletePrimeAgentGitBranch: (
    selection: PrimeAgentGitBranchSelection,
  ) => Promise<unknown>;
  renamePrimeAgentGitBranch: (
    rename: PrimeAgentGitBranchRename,
  ) => Promise<unknown>;
  initializePrimeAgentGit: (cwd: string) => Promise<unknown>;
  createPrimeAgentGitWorktree: (
    creation: PrimeAgentGitWorktreeCreation,
  ) => Promise<unknown>;
  chooseWorkspaceDirectory: () => Promise<unknown>;
  revealWorkspacePath: (workspacePath: string) => Promise<unknown>;
}>;

declare global {
  interface Window {
    readonly ernie: ErnieRendererApi;
  }
}
