# Client and connection APIs

Exact public declarations extracted from the installed package. Named types belong to Prime Agent; inspect their declarations for nested fields. Constructors and public methods are listed; implementation-private members are omitted.

## DaemonClient

Source: `node_modules/prime-agent/dist/modes/daemon/daemon-client.d.ts`.

```typescript
constructor(socketPath: string);
```

```typescript
get hello(): DaemonHello | undefined;
```

```typescript
get isConnected(): boolean;
```

```typescript
supportsServerCapability(capability: DaemonServerCapability): boolean;
```

```typescript
waitForHello(timeoutMs?: number): Promise<DaemonHello>;
```

```typescript
connect(timeoutMs?: number): Promise<void>;
```

```typescript
reconnect(timeoutMs?: number): Promise<void>;
```

```typescript
disconnectForReconnect(reason: DaemonClosingReason): void;
```

```typescript
resetTransportForReconnect(): void;
```

```typescript
onMessage(listener: DaemonClientMessageListener): () => void;
```

```typescript
onClose(listener: DaemonClientCloseListener): () => void;
```

```typescript
enableRequestRecovery(): void;
```

```typescript
enableAutoReconnect(options: DaemonClientReconnectOptions): void;
```

```typescript
request(command: DaemonCommandBody, timeoutMs?: number, options?: DaemonClientRequestOptions): Promise<DaemonResponse>;
```

```typescript
authenticateWorker(token: string, timeoutMs?: number): Promise<void>;
```

```typescript
requestWorker(command: DaemonWorkerCommandBody, timeoutMs?: number): Promise<DaemonResponse>;
```

```typescript
close(): void;
```

## AgentConnection

Source: `node_modules/prime-agent/dist/modes/agent-connection/types.d.ts`.

```typescript
subscribe(listener: AgentConnectionEventListener): () => void;
```

```typescript
onBeforeSessionInvalidate(listener: AgentConnectionBeforeSessionInvalidateListener): () => void;
```

```typescript
getState(): Promise<AgentConnectionState>;
```

```typescript
getInitialSnapshot(): Promise<AgentConnectionSnapshot>;
```

```typescript
getRlmChildSnapshots(): Promise<AgentConnectionRlmChildAgentSnapshot[]>;
```

```typescript
getMessages(): Promise<AgentMessage[]>;
```

```typescript
getSessionHeader(): Promise<AgentConnectionSessionHeader | undefined>;
```

```typescript
getCommands(): Promise<AgentConnectionSlashCommand[]>;
```

```typescript
getResourceSnapshot(): Promise<AgentConnectionResourceSnapshot>;
```

```typescript
getModelCatalog(): Promise<AgentConnectionModelCatalog>;
```

```typescript
getAvailableModels(): Promise<AgentConnectionModel[]>;
```

```typescript
getSessionStats(): Promise<SessionStats>;
```

```typescript
getContextTree(): Promise<ContextTreeNode>;
```

```typescript
getSessionContext(): Promise<AgentConnectionSessionContext>;
```

```typescript
getSessionTree(): Promise<{
        tree: AgentConnectionSessionTreeNode[];
        leafId: string | null;
    }>;
```

```typescript
listSavedSessions(scope: AgentConnectionSavedSessionScope, callbacks?: AgentConnectionSessionListCallbacks): Promise<AgentConnectionSavedSessionInfo[]>;
```

```typescript
getQueue(): Promise<AgentConnectionQueueState>;
```

```typescript
mutateQueuedMessage(lane: AgentConnectionQueuedMessageLane, index: number, expectedText: string, mutation: AgentConnectionQueuedMessageMutation): Promise<AgentConnectionQueuedMessageMutationStatus>;
```

```typescript
clearQueue(): Promise<AgentConnectionQueueState>;
```

```typescript
abortAndClearQueue(): Promise<AgentConnectionQueueState>;
```

```typescript
acquireSessionInputPause(leaseKey: string): Promise<AgentConnectionSessionInputPause>;
```

```typescript
listCronJobs(options?: {
        includeInactive?: boolean;
    }): Promise<AgentCronJob[]>;
```

```typescript
listHeartbeats(): Promise<AgentConnectionHeartbeat[]>;
```

```typescript
manageHeartbeat(activeSessionId: string, jobId: string, action: AgentHeartbeatManagementAction): Promise<AgentCronJob>;
```

```typescript
addCronJob(schedule: string, prompt: string): Promise<AgentCronJob>;
```

```typescript
cancelCronJob(jobId: string): Promise<AgentCronJob>;
```

```typescript
getHeartbeat(): Promise<AgentCronJob | undefined>;
```

```typescript
setHeartbeat(schedule: string, instruction: string, deliveryMode?: AgentHeartbeatDeliveryMode): Promise<AgentCronJob>;
```

```typescript
updateHeartbeat(action: AgentHeartbeatUpdateAction): Promise<AgentCronJob | undefined>;
```

```typescript
sendAgentMessage(targetActiveSessionId: string, message: string): Promise<AgentSessionMessageReceipt>;
```

```typescript
getAgentMessageStatus(): Promise<AgentSessionMessageSafetyStatus>;
```

```typescript
pauseAgentMessages(): Promise<AgentSessionMessageSafetyStatus>;
```

```typescript
resumeAgentMessages(): Promise<AgentSessionMessageSafetyStatus>;
```

```typescript
clearAgentMessages(): Promise<number>;
```

```typescript
getUserMessagesForForking(): Promise<AgentConnectionUserMessage[]>;
```

```typescript
getLastAssistantText(): Promise<string | undefined>;
```

```typescript
getSystemPrompt(): Promise<string>;
```

```typescript
getToolDefinition(name: string): Promise<AgentConnectionToolDefinition | undefined>;
```

```typescript
setSessionEntryLabel(entryId: string, label: string | undefined): Promise<void>;
```

```typescript
respondToExtensionUiRequest(requestId: string, response: AgentConnectionExtensionUiResponse): Promise<void>;
```

```typescript
subscribeAgentRoster?(listener: () => void): Promise<{
        summaries(): SessionSummary[];
        dispose(): Promise<void>;
    }>;
```

```typescript
supportsAcpMcpServers?(): boolean;
```

```typescript
replaceAcpMcpServers?(servers: readonly AcpMcpServerConfig[], ownerId: string): Promise<void>;
```

```typescript
releaseAcpMcpServers?(ownerId: string, serverNames: readonly string[]): Promise<void>;
```

```typescript
prompt(message: string, options?: AgentConnectionPromptOptions): Promise<void>;
```

```typescript
promptAndWait(message: string, options?: AgentConnectionPromptOptions): Promise<void>;
```

```typescript
startSideQuestion(id: string, question: string, previousTurns?: AgentConnectionSideQuestionTurn[]): Promise<void>;
```

```typescript
abortSideQuestion(id: string): Promise<boolean>;
```

```typescript
steer(message: string, images?: ImageContent[]): Promise<void>;
```

```typescript
followUp(message: string, images?: ImageContent[]): Promise<void>;
```

```typescript
abort(): Promise<void>;
```

```typescript
cancelRlmChild(childId: string): Promise<boolean>;
```

```typescript
waitForIdle(): Promise<void>;
```

```typescript
waitForHeadlessCompletion(options?: AgentConnectionHeadlessCompletionOptions): Promise<AgentAutonomousStatus>;
```

```typescript
executeBash(command: string, options?: AgentConnectionExecuteBashOptions): Promise<void>;
```

```typescript
executeBashAndWait(command: string): Promise<BashResult>;
```

```typescript
abortBash(): Promise<void>;
```

```typescript
setModel(provider: string, modelId: string): Promise<AgentConnectionModel>;
```

```typescript
cycleModel(direction?: "forward" | "backward"): Promise<AgentConnectionModelCycleResult | undefined>;
```

```typescript
setScopedModels(scopedModels: AgentConnectionScopedModel[]): Promise<void>;
```

```typescript
setThinkingLevel(level: ThinkingLevel): Promise<void>;
```

```typescript
setServiceTier(serviceTier: ServiceTier): Promise<void>;
```

```typescript
cycleThinkingLevel(): Promise<ThinkingLevel | undefined>;
```

```typescript
setTransport(transport: Transport): Promise<void>;
```

```typescript
setSteeringMode(mode: AgentConnectionQueueMode): Promise<void>;
```

```typescript
setFollowUpMode(mode: AgentConnectionQueueMode): Promise<void>;
```

```typescript
setAutoCompactionEnabled(enabled: boolean): Promise<void>;
```

```typescript
setAutoRetryEnabled(enabled: boolean): Promise<void>;
```

```typescript
compact(customInstructions?: string): Promise<CompactionResult>;
```

```typescript
refine(options?: {
        instructions?: string;
        rollbackId?: string;
        global?: boolean;
    }): Promise<RefinementResult>;
```

```typescript
abortCompaction(): Promise<void>;
```

```typescript
abortBranchSummary(): Promise<void>;
```

```typescript
abortRetry(): Promise<void>;
```

```typescript
reload(): Promise<void>;
```

```typescript
newSession(options?: AgentConnectionNewSessionOptions): Promise<{
        cancelled: boolean;
    }>;
```

```typescript
switchSession(sessionPath: string, options?: AgentConnectionSwitchSessionOptions): Promise<{
        cancelled: boolean;
    }>;
```

```typescript
fork(entryId: string, options?: AgentConnectionForkOptions): Promise<{
        cancelled: boolean;
        selectedText?: string;
    }>;
```

```typescript
navigateTree(targetId: string, options?: AgentConnectionNavigateTreeOptions): Promise<AgentConnectionNavigateTreeResult>;
```

```typescript
importFromJsonl(inputPath: string, cwdOverride?: string): Promise<{
        cancelled: boolean;
    }>;
```

```typescript
exportToHtml(outputPath?: string): Promise<string>;
```

```typescript
exportToJsonl(outputPath?: string): Promise<string>;
```

```typescript
setSessionName(name: string): Promise<void>;
```

```typescript
getRlmMaxDepthStatus(): Promise<RlmMaxDepthStatus>;
```

```typescript
setRlmMaxDepth(maxDepth: number, options?: {
        global?: boolean;
    }): Promise<SetRlmMaxDepthResult>;
```

```typescript
renameSavedSession(sessionPath: string, name: string): Promise<void>;
```

```typescript
deleteSavedSession(sessionPath: string): Promise<DeleteSessionFileResult>;
```

```typescript
watchSession(activeSessionId: string): Promise<AgentConnectionSessionWatcher | undefined>;
```

```typescript
dispose(): Promise<void>;
```
