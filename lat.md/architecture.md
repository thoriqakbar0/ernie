# Ernie architecture

Ernie is a Zenbu.js application with a React renderer, Zenbu services, and a real Prime Agent daemon.

## Runtime composition

Local browser development keeps Zenbu services in one windowless Electron main process and exposes the renderer through a stable browser gateway.

[[scripts/dev/config.ts#readDevConfig]] defines the development role and isolated state paths. [[scripts/dev/gateway.ts#startDevelopmentGateway]] forwards browser traffic and Vite HMR to the live Zenbu runtime.

See [[development#UI iteration]] for the default feedback loop.

## Renderer state

The renderer owns presentation while one provider translates Zenbu RPC and events into Prime Agent session state.

[[src/renderer/components/app.tsx#App]] composes the visible shell. [[src/renderer/prime-agent-state.tsx#PrimeAgentStateProvider]] owns renderer access to sessions, selection, actions, and models.

## Prime Agent boundary

The main process owns daemon lifetime and exposes Prime Agent operations through Zenbu RPC.

[[src/main/prime-agent/service.ts#PrimeAgentService]] owns the daemon client and session attachments. [[src/packages/prime-workspace/index.ts#createPrimeWorkspace]] converts that client into renderer-facing workspace behavior.

See [[domain#Session synchronization]] for the ordering and recovery model.

## Package boundaries

Modules under `src/packages/` expose public contracts through root entry points and keep implementation details private.

Production code imports package entry points only. Cross-package dependencies remain acyclic, and tests exercise those same public contracts.

## Persistent Agent organization

[[src/main/services/agents.ts#AgentsService]] owns typed Effect operations for roster settings, selection, and assignment. [[src/main/services/agent-store.ts#AgentStoreService]] persists them in Zenbu. [[src/renderer/agent-state.tsx#ConversationDraftProvider]] keeps session-keyed unsent text for the application lifetime. Prime Agent retains transcript and execution authority.

Zenbu 0.6 swallows flush errors. Agent writes verify a fresh token and roster on disk. Native recovery records the session path at attachment and restores immutable origin; see `docs/architecture.md` for ownership details.

## Conversation presentation

Application-owned feedback and reading positions survive workspace remounts. Structured runtime details are parsed into session-level presentation without adding a second transcript or execution authority.

[[src/renderer/conversation-flow.tsx#ConversationFlowProvider]] coordinates first-message creation and admission. [[src/renderer/conversation-activity.ts#describeConversationActivity]] projects supported tool results. [[src/renderer/components/ui/message-scroller.tsx#MessageReadingProvider]] owns transient reading positions.
