import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

import type { ErnieRendererApi } from './renderer-api.js' with {
  'resolution-mode': 'import',
};
import type { JsonValue } from './packages/json-value/index.js' with {
  'resolution-mode': 'import',
};

// Sandboxed preloads cannot load local runtime modules. Keep these channel
// literals in sync with renderer-api.ts.
const rendererReadyChannel = 'ernie:renderer-ready';
const colorThemeRequestChannel = 'ernie:color-theme:request';
const sidebarControlRequestChannel = 'ernie:sidebar:control-request';
const agentHarnessChannel = 'ernie:daemon:harness';
const primeAgentWorkspaceChannel = 'ernie:prime-agent:workspace';
const primeAgentWorkspaceFeedStartChannel =
  'ernie:prime-agent:workspace-feed:start';
const primeAgentWorkspaceFeedStopChannel =
  'ernie:prime-agent:workspace-feed:stop';
const primeAgentWorkspaceFeedEventChannel =
  'ernie:prime-agent:workspace-feed:event';
const primeAgentCreateSessionChannel = 'ernie:prime-agent:create-session';
const primeAgentSavedSessionsChannel = 'ernie:prime-agent:saved-sessions';
const primeAgentImportSessionChannel = 'ernie:prime-agent:import-session';
const primeAgentRenameSessionChannel = 'ernie:prime-agent:rename-session';
const primeAgentModelsChannel = 'ernie:prime-agent:models';
const primeAgentSkillsChannel = 'ernie:prime-agent:skills';
const primeAgentSessionFeedStartChannel =
  'ernie:prime-agent:session-feed:start';
const primeAgentSessionFeedStopChannel =
  'ernie:prime-agent:session-feed:stop';
const primeAgentSessionFeedEventChannel =
  'ernie:prime-agent:session-feed:event';
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

let nextSessionFeedSubscription = 0;
let nextWorkspaceFeedSubscription = 0;
const workspaceFeedListeners = new Map<
  string,
  Parameters<ErnieRendererApi['watchAgentWorkspace']>[0]
>();
const sessionFeedListeners = new Map<
  string,
  Parameters<ErnieRendererApi['watchAgentSession']>[1]
>();
let selectedSessionFeedSubscriptionId: string | null = null;

ipcRenderer.on(
  primeAgentSessionFeedEventChannel,
  (_event, subscriptionId, value) => {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Sandboxed preload cannot import the domain parser; the renderer parses the forwarded envelope.
    if (typeof subscriptionId !== 'string') return;
    sessionFeedListeners.get(subscriptionId)?.(value);
  },
);

ipcRenderer.on(
  primeAgentWorkspaceFeedEventChannel,
  (_event, subscriptionId, value) => {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Sandboxed preload cannot import the domain parser; the renderer parses the forwarded item.
    if (typeof subscriptionId !== 'string') return;
    workspaceFeedListeners.get(subscriptionId)?.(value);
  },
);

window.addEventListener('unload', () => {
  for (const subscriptionId of workspaceFeedListeners.keys()) {
    ipcRenderer.send(primeAgentWorkspaceFeedStopChannel, subscriptionId);
  }
  workspaceFeedListeners.clear();
  if (selectedSessionFeedSubscriptionId !== null) {
    ipcRenderer.send(
      primeAgentSessionFeedStopChannel,
      selectedSessionFeedSubscriptionId,
    );
  }
  sessionFeedListeners.clear();
  selectedSessionFeedSubscriptionId = null;
});

const rendererApi: ErnieRendererApi = Object.freeze({
  signalReady(): void {
    ipcRenderer.send(rendererReadyChannel);
  },
  onColorThemeRequest(listener) {
    const handleThemeRequest = (
      _event: IpcRendererEvent,
      value: JsonValue,
    ): void => {
      listener(value);
    };
    ipcRenderer.on(colorThemeRequestChannel, handleThemeRequest);
    return () => ipcRenderer.off(colorThemeRequestChannel, handleThemeRequest);
  },
  onSidebarControlRequest(listener) {
    const handleSidebarControlRequest = (
      _event: IpcRendererEvent,
      value: JsonValue,
    ): void => {
      listener(value);
    };
    ipcRenderer.on(sidebarControlRequestChannel, handleSidebarControlRequest);
    return () =>
      ipcRenderer.off(
        sidebarControlRequestChannel,
        handleSidebarControlRequest,
      );
  },
  describeAgentHarness() {
    return ipcRenderer.invoke(agentHarnessChannel);
  },
  listAgentWorkspace() {
    return ipcRenderer.invoke(primeAgentWorkspaceChannel);
  },
  watchAgentWorkspace(listener) {
    nextWorkspaceFeedSubscription += 1;
    const subscriptionId =
      `${Date.now()}-workspace-${nextWorkspaceFeedSubscription}`;
    workspaceFeedListeners.set(subscriptionId, listener);
    ipcRenderer.send(primeAgentWorkspaceFeedStartChannel, subscriptionId);
    return subscriptionId;
  },
  unwatchAgentWorkspace(subscriptionId) {
    workspaceFeedListeners.delete(subscriptionId);
    ipcRenderer.send(primeAgentWorkspaceFeedStopChannel, subscriptionId);
  },
  createAgentSession(creation) {
    return ipcRenderer.invoke(primeAgentCreateSessionChannel, creation);
  },
  listAgentSavedSessions() {
    return ipcRenderer.invoke(primeAgentSavedSessionsChannel);
  },
  importAgentSession(sessionPath) {
    return ipcRenderer.invoke(primeAgentImportSessionChannel, sessionPath);
  },
  renameAgentSession(rename) {
    return ipcRenderer.invoke(primeAgentRenameSessionChannel, rename);
  },
  listAgentModels(activeSessionId) {
    return ipcRenderer.invoke(primeAgentModelsChannel, activeSessionId);
  },
  listAgentSkills(activeSessionId) {
    return ipcRenderer.invoke(primeAgentSkillsChannel, activeSessionId);
  },
  watchAgentSession(activeSessionId, listener) {
    if (selectedSessionFeedSubscriptionId !== null) {
      sessionFeedListeners.delete(selectedSessionFeedSubscriptionId);
      ipcRenderer.send(
        primeAgentSessionFeedStopChannel,
        selectedSessionFeedSubscriptionId,
      );
    }
    nextSessionFeedSubscription += 1;
    const subscriptionId = `${Date.now()}-${nextSessionFeedSubscription}`;
    selectedSessionFeedSubscriptionId = subscriptionId;
    sessionFeedListeners.set(subscriptionId, listener);
    ipcRenderer.send(primeAgentSessionFeedStartChannel, {
      activeSessionId,
      subscriptionId,
    });
    return subscriptionId;
  },
  unwatchAgentSession(subscriptionId) {
    if (selectedSessionFeedSubscriptionId !== subscriptionId) return;
    selectedSessionFeedSubscriptionId = null;
    sessionFeedListeners.delete(subscriptionId);
    ipcRenderer.send(primeAgentSessionFeedStopChannel, subscriptionId);
  },
  setAgentModel(selection) {
    return ipcRenderer.invoke(primeAgentSetModelChannel, selection);
  },
  getAgentRlmDepth(activeSessionId) {
    return ipcRenderer.invoke(primeAgentRlmDepthChannel, activeSessionId);
  },
  setAgentRlmDepth(selection) {
    return ipcRenderer.invoke(primeAgentSetRlmDepthChannel, selection);
  },
  submitAgentTask(submission) {
    return ipcRenderer.invoke(primeAgentSubmitTaskChannel, submission);
  },
  refineAgentSession(request) {
    return ipcRenderer.invoke(primeAgentRefineSessionChannel, request);
  },
  listGitBranches(cwd) {
    return ipcRenderer.invoke(primeAgentGitBranchesChannel, cwd);
  },
  readGitWorkspace(cwd) {
    return ipcRenderer.invoke(primeAgentGitWorkspaceChannel, cwd);
  },
  switchGitBranch(selection) {
    return ipcRenderer.invoke(primeAgentSwitchGitBranchChannel, selection);
  },
  deleteGitBranch(selection) {
    return ipcRenderer.invoke(primeAgentDeleteGitBranchChannel, selection);
  },
  renameGitBranch(rename) {
    return ipcRenderer.invoke(primeAgentRenameGitBranchChannel, rename);
  },
  initializeGit(cwd) {
    return ipcRenderer.invoke(primeAgentInitializeGitChannel, cwd);
  },
  createGitWorktree(creation) {
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
window.addEventListener(
  'DOMContentLoaded',
  () => window.dispatchEvent(new Event('ernie:preload-ready')),
  { once: true },
);
