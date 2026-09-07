const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('ernieHistory', {
  finish: operationId => ipcRenderer.invoke('ernie-history-finish', operationId),
  hostStatus: () => ipcRenderer.invoke('ernie-history-host-status'),
  reopen: () => ipcRenderer.invoke('ernie-history-reopen'),
  request: request => ipcRenderer.invoke('ernie-history-request', request),
  approve: proposalId => ipcRenderer.invoke('ernie-history-approve', proposalId),
})
