import type {
  PrimeAgentGitBranchRename,
  PrimeAgentGitBranchSelection,
  PrimeAgentModelSelection,
  PrimeAgentRlmDepthSelection,
} from './packages/prime-agent-daemon/types';

/** IPC channel emitted after the renderer has painted its required surface. */
export const rendererReadyChannel = 'ernie:renderer-ready';

/** IPC channel that lists live sessions from the Prime Agent daemon. */
export const primeAgentWorkspaceChannel = 'ernie:prime-agent:workspace';

/** IPC channel that lists configured models for one Prime Agent session. */
export const primeAgentModelsChannel = 'ernie:prime-agent:models';

/** IPC channel that changes the model for one Prime Agent session. */
export const primeAgentSetModelChannel = 'ernie:prime-agent:set-model';

/** IPC channel that reads RLM maximum depth for one Prime Agent session. */
export const primeAgentRlmDepthChannel = 'ernie:prime-agent:rlm-depth';

/** IPC channel that changes RLM maximum depth for one Prime Agent session. */
export const primeAgentSetRlmDepthChannel = 'ernie:prime-agent:set-rlm-depth';

/** IPC channel that reads local branches for one workspace. */
export const primeAgentGitBranchesChannel = 'ernie:prime-agent:git-branches';

/** IPC channel that switches one workspace to a local branch. */
export const primeAgentSwitchGitBranchChannel =
  'ernie:prime-agent:switch-git-branch';

/** IPC channel that deletes one merged local branch. */
export const primeAgentDeleteGitBranchChannel =
  'ernie:prime-agent:delete-git-branch';

/** IPC channel that renames one local branch. */
export const primeAgentRenameGitBranchChannel =
  'ernie:prime-agent:rename-git-branch';

/** Minimal preload API exposed to the isolated renderer context. */
export type ErnieRendererApi = Readonly<{
  signalReady: () => void;
  listPrimeAgentWorkspace: () => Promise<unknown>;
  listPrimeAgentModels: (activeSessionId: string) => Promise<unknown>;
  setPrimeAgentModel: (selection: PrimeAgentModelSelection) => Promise<unknown>;
  getPrimeAgentRlmDepth: (activeSessionId: string) => Promise<unknown>;
  setPrimeAgentRlmDepth: (
    selection: PrimeAgentRlmDepthSelection,
  ) => Promise<unknown>;
  listPrimeAgentGitBranches: (cwd: string) => Promise<unknown>;
  switchPrimeAgentGitBranch: (
    selection: PrimeAgentGitBranchSelection,
  ) => Promise<unknown>;
  deletePrimeAgentGitBranch: (
    selection: PrimeAgentGitBranchSelection,
  ) => Promise<unknown>;
  renamePrimeAgentGitBranch: (
    rename: PrimeAgentGitBranchRename,
  ) => Promise<unknown>;
}>;

declare global {
  interface Window {
    readonly ernie: ErnieRendererApi;
  }
}
