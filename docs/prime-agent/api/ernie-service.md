# Ernie service API

Public method signatures extracted from `src/main/prime-agent/service.ts` in the UI worktree. These use Ernie logical IDs and application contracts; native commands use active IDs. Framework lifecycle `evaluate` is omitted. Methods without explicit return annotations retain inferred source return types; consult the implementation.

Call through the existing typed Zenbu client. A method here does not imply a visible control or permission to invoke it.

## getSessionState

```typescript
async getSessionState(): Promise<PrimeSessionState>
```

## selectSession

```typescript
async selectSession(input: { sessionId?: string })
```

## prepareAgentRoot

```typescript
async prepareAgentRoot(input: { agentId: string; cwd: string; name: string })
```

## inspectAgentRoot

```typescript
async inspectAgentRoot(input: { sessionId: string; sessionFile?: string })
```

## activateAgentRoot

```typescript
async activateAgentRoot(input: { sessionId: string; sessionFile: string; name: string; origin?: ConversationOrigin; prepared: boolean })
```

## renameAgentRoot

```typescript
async renameAgentRoot(input: { sessionId: string; sessionFile: string; name: string; expectedName?: string })
```

## createSession

```typescript
async createSession(input: { cwd: string; name?: string; origin?: ConversationOrigin; creationId?: string })
```

## attachSession

```typescript
async attachSession(input: { sessionId: string }): Promise<PrimeSessionSnapshotEnvelope>
```

## inspectChild

```typescript
async inspectChild(input: { parentSessionId: string; childId: string }): Promise<PrimeSessionInspection>
```

## getSendEpoch

```typescript
async getSendEpoch(): Promise<string>
```

## checkSend

```typescript
async checkSend(input: SendRequest): Promise<SendReceipt>
```

## sendMessage

```typescript
async sendMessage(input: SendRequest): Promise<SendReceipt>
```

## abort

```typescript
async abort(input: { sessionId: string })
```

## waitForIdle

```typescript
async waitForIdle(input: { sessionId: string })
```

## getModels

```typescript
async getModels(input: { sessionId: string }): Promise<readonly PrimeModel[]>
```

## setModel

```typescript
async setModel(input: { sessionId: string; provider: string; modelId: string })
```

## getRecurrentDepth

```typescript
async getRecurrentDepth(input: { sessionId: string })
```

## setEffort

```typescript
async setEffort(input: {
    sessionId: string
    effort: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
  })
```

## setRecurrentDepth

```typescript
async setRecurrentDepth(input: { sessionId: string; recurrentDepth: number })
```
