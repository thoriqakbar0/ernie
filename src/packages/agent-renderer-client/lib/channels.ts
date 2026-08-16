/** Canonical Electron channel identity for Agent and local workspace traffic. */
export const agentRendererChannels = Object.freeze({
  chooseWorkspaceDirectory: 'ernie:workspace:choose-directory',
  createGitWorktree: 'ernie:prime-agent:create-git-worktree',
  createSession: 'ernie:prime-agent:create-session',
  deleteGitBranch: 'ernie:prime-agent:delete-git-branch',
  describeHarness: 'ernie:daemon:harness',
  getConfiguration: 'ernie:prime-agent:configuration',
  getRlmDepth: 'ernie:prime-agent:rlm-depth',
  importSession: 'ernie:prime-agent:import-session',
  initializeGit: 'ernie:prime-agent:initialize-git',
  listGitBranches: 'ernie:prime-agent:git-branches',
  listModels: 'ernie:prime-agent:models',
  listSavedSessions: 'ernie:prime-agent:saved-sessions',
  listSkills: 'ernie:prime-agent:skills',
  listWorkspace: 'ernie:prime-agent:workspace',
  loadSessionHistory: 'ernie:prime-agent:session-history',
  readGitWorkspace: 'ernie:prime-agent:git-workspace',
  refineSession: 'ernie:prime-agent:refine-session',
  renameGitBranch: 'ernie:prime-agent:rename-git-branch',
  renameSession: 'ernie:prime-agent:rename-session',
  sessionFeedEvent: 'ernie:prime-agent:session-feed:event',
  sessionFeedStart: 'ernie:prime-agent:session-feed:start',
  sessionFeedStop: 'ernie:prime-agent:session-feed:stop',
  setModel: 'ernie:prime-agent:set-model',
  setRlmDepth: 'ernie:prime-agent:set-rlm-depth',
  setThinkingLevel: 'ernie:prime-agent:set-thinking-level',
  submitTask: 'ernie:prime-agent:submit-task',
  switchGitBranch: 'ernie:prime-agent:switch-git-branch',
  workspaceFeedEvent: 'ernie:prime-agent:workspace-feed:event',
  workspaceFeedStart: 'ernie:prime-agent:workspace-feed:start',
  workspaceFeedStop: 'ernie:prime-agent:workspace-feed:stop',
});

/** One channel value from the canonical Agent renderer contract. */
export type AgentRendererChannel =
  (typeof agentRendererChannels)[keyof typeof agentRendererChannels];
