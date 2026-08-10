import { contextBridge, ipcRenderer } from 'electron';

import type { ErnieRendererApi } from './renderer-api';

// Sandboxed preloads cannot load local runtime modules. Keep this literal in
// sync with rendererReadyChannel in renderer-api.ts.
const rendererReadyChannel = 'ernie:renderer-ready';
const primeAgentWorkspaceChannel = 'ernie:prime-agent:workspace';
const primeAgentModelsChannel = 'ernie:prime-agent:models';
const primeAgentSetModelChannel = 'ernie:prime-agent:set-model';
const primeAgentRlmDepthChannel = 'ernie:prime-agent:rlm-depth';
const primeAgentSetRlmDepthChannel = 'ernie:prime-agent:set-rlm-depth';
const primeAgentGitBranchesChannel = 'ernie:prime-agent:git-branches';
const primeAgentSwitchGitBranchChannel =
  'ernie:prime-agent:switch-git-branch';
const primeAgentDeleteGitBranchChannel =
  'ernie:prime-agent:delete-git-branch';
const primeAgentRenameGitBranchChannel =
  'ernie:prime-agent:rename-git-branch';
const primeAgentInitializeGitChannel = 'ernie:prime-agent:initialize-git';
const primeAgentCreateGitWorktreeChannel =
  'ernie:prime-agent:create-git-worktree';
const chooseWorkspaceDirectoryChannel = 'ernie:workspace:choose-directory';

const rendererApi: ErnieRendererApi = Object.freeze({
  signalReady(): void {
    ipcRenderer.send(rendererReadyChannel);
  },
  listPrimeAgentWorkspace() {
    return ipcRenderer.invoke(primeAgentWorkspaceChannel);
  },
  listPrimeAgentModels(activeSessionId) {
    return ipcRenderer.invoke(primeAgentModelsChannel, activeSessionId);
  },
  setPrimeAgentModel(selection) {
    return ipcRenderer.invoke(primeAgentSetModelChannel, selection);
  },
  getPrimeAgentRlmDepth(activeSessionId) {
    return ipcRenderer.invoke(primeAgentRlmDepthChannel, activeSessionId);
  },
  setPrimeAgentRlmDepth(selection) {
    return ipcRenderer.invoke(primeAgentSetRlmDepthChannel, selection);
  },
  listPrimeAgentGitBranches(cwd) {
    return ipcRenderer.invoke(primeAgentGitBranchesChannel, cwd);
  },
  switchPrimeAgentGitBranch(selection) {
    return ipcRenderer.invoke(primeAgentSwitchGitBranchChannel, selection);
  },
  deletePrimeAgentGitBranch(selection) {
    return ipcRenderer.invoke(primeAgentDeleteGitBranchChannel, selection);
  },
  renamePrimeAgentGitBranch(rename) {
    return ipcRenderer.invoke(primeAgentRenameGitBranchChannel, rename);
  },
  initializePrimeAgentGit(cwd) {
    return ipcRenderer.invoke(primeAgentInitializeGitChannel, cwd);
  },
  createPrimeAgentGitWorktree(creation) {
    return ipcRenderer.invoke(primeAgentCreateGitWorktreeChannel, creation);
  },
  chooseWorkspaceDirectory() {
    return ipcRenderer.invoke(chooseWorkspaceDirectoryChannel);
  },
});

contextBridge.exposeInMainWorld('ernie', rendererApi);
