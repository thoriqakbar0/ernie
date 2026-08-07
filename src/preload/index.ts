import { contextBridge, ipcRenderer } from "electron";
import type { AgentSlashCommand } from "../shared/commands";
import type { AgentCommand, AgentEvent, AgentState, CommandResult, ErnieApi } from "../shared/contract";

const api: ErnieApi = Object.freeze({
  platform: process.platform,
  getState: () => ipcRenderer.invoke("agent:get-state") as Promise<AgentState>,
  getCommands: () => ipcRenderer.invoke("agent:get-commands") as Promise<readonly AgentSlashCommand[]>,
  command: (command: AgentCommand) => ipcRenderer.invoke("agent:command", command) as Promise<CommandResult>,
  onAgentEvent: (listener: (event: AgentEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AgentEvent) => listener(payload);
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.removeListener("agent:event", handler);
  },
});

contextBridge.exposeInMainWorld("ernie", api);
