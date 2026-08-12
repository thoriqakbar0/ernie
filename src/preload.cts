import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

import type { ErnieRendererApi } from './renderer-api.js' with {
  'resolution-mode': 'import',
};
import type { JsonValue } from './packages/json-value/index.js' with {
  'resolution-mode': 'import',
};

// Sandboxed preloads cannot load local runtime modules. Keep this literal in
// sync with rendererReadyChannel in renderer-api.ts.
const rendererReadyChannel = 'ernie:renderer-ready';
const primeAgentWorkspaceChannel = 'ernie:prime-agent:workspace';
const primeAgentCreateSessionChannel = 'ernie:prime-agent:create-session';
const primeAgentSavedSessionsChannel = 'ernie:prime-agent:saved-sessions';
const primeAgentImportSessionChannel = 'ernie:prime-agent:import-session';
const primeAgentRenameSessionChannel = 'ernie:prime-agent:rename-session';
const primeAgentModelsChannel = 'ernie:prime-agent:models';
const primeAgentSkillsChannel = 'ernie:prime-agent:skills';
const primeAgentSessionViewChannel = 'ernie:prime-agent:session-view';
const primeAgentSetModelChannel = 'ernie:prime-agent:set-model';
const primeAgentRlmDepthChannel = 'ernie:prime-agent:rlm-depth';
const primeAgentSetRlmDepthChannel = 'ernie:prime-agent:set-rlm-depth';
const primeAgentSubmitTaskChannel = 'ernie:prime-agent:submit-task';
const primeAgentRefineSessionChannel = 'ernie:prime-agent:refine-session';
const primeAgentGitBranchesChannel = 'ernie:prime-agent:git-branches';
const primeAgentGitWorkspaceChannel = 'ernie:prime-agent:git-workspace';
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
const revealWorkspacePathChannel = 'ernie:workspace:reveal-path';
const browserPluginShowChannel = 'ernie:plugin:browser:show';
const browserPluginHideChannel = 'ernie:plugin:browser:hide';
const browserPluginNavigateChannel = 'ernie:plugin:browser:navigate';
const browserPluginBackChannel = 'ernie:plugin:browser:back';
const browserPluginForwardChannel = 'ernie:plugin:browser:forward';
const browserPluginReloadChannel = 'ernie:plugin:browser:reload';
const browserPluginStateChannel = 'ernie:plugin:browser:state';

const rendererApi: ErnieRendererApi = Object.freeze({
  signalReady(): void {
    ipcRenderer.send(rendererReadyChannel);
  },
  listPrimeAgentWorkspace() {
    return ipcRenderer.invoke(primeAgentWorkspaceChannel);
  },
  createPrimeAgentSession(creation) {
    return ipcRenderer.invoke(primeAgentCreateSessionChannel, creation);
  },
  listPrimeAgentSavedSessions() {
    return ipcRenderer.invoke(primeAgentSavedSessionsChannel);
  },
  importPrimeAgentSession(sessionPath) {
    return ipcRenderer.invoke(primeAgentImportSessionChannel, sessionPath);
  },
  renamePrimeAgentSession(rename) {
    return ipcRenderer.invoke(primeAgentRenameSessionChannel, rename);
  },
  listPrimeAgentModels(activeSessionId) {
    return ipcRenderer.invoke(primeAgentModelsChannel, activeSessionId);
  },
  listPrimeAgentSkills(activeSessionId) {
    return ipcRenderer.invoke(primeAgentSkillsChannel, activeSessionId);
  },
  getPrimeAgentSessionView(activeSessionId) {
    return ipcRenderer.invoke(primeAgentSessionViewChannel, activeSessionId);
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
  submitPrimeAgentTask(submission) {
    return ipcRenderer.invoke(primeAgentSubmitTaskChannel, submission);
  },
  refinePrimeAgentSession(request) {
    return ipcRenderer.invoke(primeAgentRefineSessionChannel, request);
  },
  listPrimeAgentGitBranches(cwd) {
    return ipcRenderer.invoke(primeAgentGitBranchesChannel, cwd);
  },
  readPrimeAgentGitWorkspace(cwd) {
    return ipcRenderer.invoke(primeAgentGitWorkspaceChannel, cwd);
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
  revealWorkspacePath(workspacePath) {
    return ipcRenderer.invoke(revealWorkspacePathChannel, workspacePath);
  },
  showBrowserPlugin(bounds) {
    return ipcRenderer.invoke(browserPluginShowChannel, bounds);
  },
  hideBrowserPlugin() {
    return ipcRenderer.invoke(browserPluginHideChannel);
  },
  navigateBrowserPlugin(address) {
    return ipcRenderer.invoke(browserPluginNavigateChannel, address);
  },
  goBackBrowserPlugin() {
    return ipcRenderer.invoke(browserPluginBackChannel);
  },
  goForwardBrowserPlugin() {
    return ipcRenderer.invoke(browserPluginForwardChannel);
  },
  reloadBrowserPlugin() {
    return ipcRenderer.invoke(browserPluginReloadChannel);
  },
  onBrowserPluginState(listener) {
    const handleState = (_event: IpcRendererEvent, value: JsonValue): void => {
      listener(value);
    };
    ipcRenderer.on(browserPluginStateChannel, handleState);
    return () => ipcRenderer.off(browserPluginStateChannel, handleState);
  },
});

contextBridge.exposeInMainWorld('ernie', rendererApi);
