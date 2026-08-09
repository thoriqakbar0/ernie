import { contextBridge, ipcRenderer } from "electron";
import type { AgentSlashCommand } from "../shared/commands";
import type { WorkspaceSnapshot } from "../shared/workspace";
import type { DevServerSnapshot } from "../shared/devServer";
import type { RendererPerformanceSample } from "../shared/performance";
import type { SessionTranscriptEvent, SessionTranscriptSnapshot } from "../shared/sessionTranscript";
import type { AgentCommand, ArchiveProjectResult, CommandResult, CreateWorktreeInput, ErnieApi, OpenProjectResult, WorktreeCommandResult, WorkspaceEvent } from "../shared/contract";
import type { AgentModelOption, SpaceAgentEvent, SpaceRuntimeState, StartSpaceInput } from "../shared/spaceRuntime";

const api: ErnieApi = Object.freeze({
  platform: process.platform,
  getSpaceState: (spaceId: string) => ipcRenderer.invoke("space:get-state", spaceId) as Promise<SpaceRuntimeState>,
  getSpaceCommands: (spaceId: string) => ipcRenderer.invoke("space:get-commands", spaceId) as Promise<readonly AgentSlashCommand[]>,
  getSpaceModels: (spaceId: string) => ipcRenderer.invoke("space:get-models", spaceId) as Promise<readonly AgentModelOption[]>,
  getSpaceRlmMaxDepth: (spaceId: string) => ipcRenderer.invoke("space:get-rlm-max-depth", spaceId) as Promise<number>,
  startSpace: (input: StartSpaceInput) => ipcRenderer.invoke("space:start", input) as Promise<CommandResult>,
  spaceCommand: (spaceId: string, command: AgentCommand) => ipcRenderer.invoke("space:command", { spaceId, command }) as Promise<CommandResult>,
  onSpaceEvent: (listener: (event: SpaceAgentEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: SpaceAgentEvent) => listener(payload);
    ipcRenderer.on("space:event", handler);
    return () => ipcRenderer.removeListener("space:event", handler);
  },
  getWorkspace: () => ipcRenderer.invoke("workspace:get-snapshot") as Promise<WorkspaceSnapshot>,
  openProjectDirectory: () => ipcRenderer.invoke("workspace:open-project") as Promise<OpenProjectResult>,
  archiveProject: (projectId: string) => ipcRenderer.invoke("workspace:archive-project", projectId) as Promise<ArchiveProjectResult>,
  createWorktree: (input: CreateWorktreeInput) => ipcRenderer.invoke("workspace:create-worktree", input) as Promise<WorktreeCommandResult>,
  archiveWorktree: (worktreeId: string) => ipcRenderer.invoke("workspace:archive-worktree", worktreeId) as Promise<WorktreeCommandResult>,
  restoreWorktree: (worktreeId: string) => ipcRenderer.invoke("workspace:restore-worktree", worktreeId) as Promise<WorktreeCommandResult>,
  removeWorktreeCheckout: (worktreeId: string) => ipcRenderer.invoke("workspace:remove-worktree-checkout", worktreeId) as Promise<WorktreeCommandResult>,
  refreshDevServers: (worktreeId: string) => ipcRenderer.invoke("dev-server:refresh", worktreeId) as Promise<DevServerSnapshot>,
  openDevServer: (worktreeId: string, port: number, url: string) => ipcRenderer.invoke("dev-server:open", { worktreeId, port, url }) as Promise<CommandResult>,
  copyText: (text: string) => ipcRenderer.invoke("clipboard:write-text", text) as Promise<CommandResult>,
  getRendererPerformance: () => ipcRenderer.invoke("performance:renderer-sample") as Promise<RendererPerformanceSample | null>,
  selectSessionTranscript: (activeSessionId: string) => ipcRenderer.invoke("session-transcript:select", activeSessionId) as Promise<SessionTranscriptSnapshot>,
  detachSessionTranscript: () => ipcRenderer.invoke("session-transcript:detach") as Promise<void>,
  onWorkspaceEvent: (listener: (event: WorkspaceEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: WorkspaceEvent) => listener(payload);
    ipcRenderer.on("workspace:event", handler);
    return () => ipcRenderer.removeListener("workspace:event", handler);
  },
  onSessionTranscriptEvent: (listener: (event: SessionTranscriptEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: SessionTranscriptEvent) => listener(payload);
    ipcRenderer.on("session-transcript:event", handler);
    return () => ipcRenderer.removeListener("session-transcript:event", handler);
  },
});

contextBridge.exposeInMainWorld("ernie", api);
