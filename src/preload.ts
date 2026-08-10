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

const rendererApi: ErnieRendererApi = Object.freeze({
  signalReady(): void {
    ipcRenderer.send(rendererReadyChannel);
  },
  async listPrimeAgentWorkspace(): Promise<unknown> {
    return ipcRenderer.invoke(primeAgentWorkspaceChannel);
  },
  async listPrimeAgentModels(activeSessionId): Promise<unknown> {
    return ipcRenderer.invoke(primeAgentModelsChannel, activeSessionId);
  },
  async setPrimeAgentModel(selection): Promise<unknown> {
    return ipcRenderer.invoke(primeAgentSetModelChannel, selection);
  },
  async getPrimeAgentRlmDepth(activeSessionId): Promise<unknown> {
    return ipcRenderer.invoke(primeAgentRlmDepthChannel, activeSessionId);
  },
  async setPrimeAgentRlmDepth(selection): Promise<unknown> {
    return ipcRenderer.invoke(primeAgentSetRlmDepthChannel, selection);
  },
});

contextBridge.exposeInMainWorld('ernie', rendererApi);
