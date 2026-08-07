import { contextBridge, ipcRenderer } from "electron";
import type { AgentSlashCommand } from "../shared/commands";
import type { WorkspaceSnapshot } from "../shared/workspace";
import type { DevServerSnapshot } from "../shared/devServer";
import type { SessionTranscriptEvent, SessionTranscriptSnapshot } from "../shared/sessionTranscript";
import type { AgentCommand, AgentEvent, AgentState, CommandResult, ErnieApi } from "../shared/contract";

const api: ErnieApi = Object.freeze({
  platform: process.platform,
  getState: () => ipcRenderer.invoke("agent:get-state") as Promise<AgentState>,
  getCommands: () => ipcRenderer.invoke("agent:get-commands") as Promise<readonly AgentSlashCommand[]>,
  getWorkspace: () => ipcRenderer.invoke("workspace:get-snapshot") as Promise<WorkspaceSnapshot>,
  refreshDevServers: (worktreeId: string) => ipcRenderer.invoke("dev-server:refresh", worktreeId) as Promise<DevServerSnapshot>,
  openDevServer: (worktreeId: string, port: number, url: string) => ipcRenderer.invoke("dev-server:open", { worktreeId, port, url }) as Promise<CommandResult>,
  copyText: (text: string) => ipcRenderer.invoke("clipboard:write-text", text) as Promise<CommandResult>,
  selectSessionTranscript: (activeSessionId: string) => ipcRenderer.invoke("session-transcript:select", activeSessionId) as Promise<SessionTranscriptSnapshot>,
  detachSessionTranscript: () => ipcRenderer.invoke("session-transcript:detach") as Promise<void>,
  command: (command: AgentCommand) => ipcRenderer.invoke("agent:command", command) as Promise<CommandResult>,
  onAgentEvent: (listener: (event: AgentEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AgentEvent) => listener(payload);
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.removeListener("agent:event", handler);
  },
  onSessionTranscriptEvent: (listener: (event: SessionTranscriptEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: SessionTranscriptEvent) => listener(payload);
    ipcRenderer.on("session-transcript:event", handler);
    return () => ipcRenderer.removeListener("session-transcript:event", handler);
  },
});

contextBridge.exposeInMainWorld("ernie", api);
