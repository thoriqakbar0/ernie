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

Zenbu 0.6 swallows flush errors. Agent writes verify a fresh token and roster on disk. Native attachment resolves the active session ID before snapshot events arrive and shares pending acquisition. Recovery records the session path and restores immutable origin; see `docs/architecture.md` for ownership details.

## Conversation presentation

Application-owned feedback and reading positions survive workspace remounts. Structured runtime details are parsed into session-level presentation without adding a second transcript or execution authority.

[[src/renderer/conversation-flow.tsx#ConversationFlowProvider]] coordinates first-message creation and admission. [[src/renderer/conversation-activity.ts#describeConversationActivity]] projects supported tool results. [[src/renderer/components/ui/message-scroller.tsx#MessageReadingProvider]] owns transient reading positions.

Response annotations share the versioned conversation draft. [[src/renderer/response-annotation.ts#annotatedMessage]] serializes attributed excerpts and comments through the existing send flow. Admission clears only the captured draft; failures retain it.

[[src/renderer/components/reconnect-agent.tsx#ReconnectAgent]] restores a selected saved root when no session is attached. It waits for pending roster operations and attempts once per workspace mount, retaining explicit retry after failure.

### Transcript render ownership

The transcript mounts every readable message. Memoized rows reuse unchanged message identities; scroll-end controls subscribe separately. Reading positions remain owned by the scroller provider.

[[src/renderer/components/conversation-transcript.tsx#ConversationTranscript]] owns the transcript tree. Message parsing belongs to memoized rows, so accepted updates only reparse changed rows. [[src/renderer/components/ui/message-scroller.tsx#MessageScrollerProvider]] publishes at-end changes to context consumers.

## Conversation page bounds and markdown

The conversation page constrains its flex layout to the workspace grid. The transcript scrolls inside that space while the header and composer remain visible.

Scrolling away from the end shows the jump-to-latest control without an animated loading line. Conversations with messages hide composer settings shortcuts; header settings still opens the inline controls.

Assistant replies use `src/renderer/components/message-markdown.tsx` with React Markdown and GFM. Raw HTML is skipped; links use the renderer default URL filtering. User messages remain plain text.

## Tool run inspection

The run inspector opens during active work and follows new tool calls, then retains its selection when work settles. Python calls appear before their results arrive.

[[src/renderer/components/conversation-activity.tsx#ConversationActivity]] defers detail content until the first expansion. After opening, details remain mounted across collapse so run selection and native roster inspection survive reopening.

Code and output wrap without individual scroll areas. The fixed-height inspector body owns scrolling; mouse run markers use a compact seven-pixel pitch, with larger touch targets. The marker rail centers when it fits and scrolls when it overflows. Hover and keyboard focus magnify three neighboring markers using transform-only transitions; reduced motion removes the transition.

## Stable run content

The run panel retains its DOM identity while selection changes code and output. Scritto animates the run index and execution count in place, honoring reduced motion.

The implementation lives in `src/renderer/components/run-inspector.tsx`; panel entrance animations are intentionally absent.

## Python source highlighting

Tool source uses lazy Shiki Python highlighting with a shared JavaScript regex engine and a bounded token cache. Source remains readable if highlighting cannot load or exceeds 40,000 characters.

`src/renderer/components/python-source.tsx` renders tokens as text spans. The run heading shows status only for tool errors.
