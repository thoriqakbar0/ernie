# Prime Agent runtime

Ernie projects Prime Agent daemon state into one typed session model shared by its main process and renderer.

## Session-state authority

[[src/main/prime-agent/service.ts#PrimeAgentService]] owns the session catalog and selected session identifier. The renderer subscribes to revisioned state and does not poll the daemon.

## Snapshot authority

[[src/packages/prime-agent/index.ts#PrimeSessionSnapshot]] is the authoritative displayed state for one session, including messages, useful activity, and transport status.

[[src/renderer/prime-agent-state.tsx#PrimeAgentStateProvider]] exposes that state to the renderer without creating a second session model.

Event bursts share one queued snapshot refresh per attachment. Events during an active read retain one follow-up, so newer native state is still projected without accumulating duplicate transcript work.

## Ordered synchronization

Each attachment starts from a snapshot envelope. Ordered changes apply only to the same session and generation at the expected revision.

[[src/packages/prime-agent/sync.ts#createPrimeSessionSyncState]] owns the synchronization state. Revision gaps, overflow, or generation changes require a fresh snapshot.

## Renderer event routing

Renderer clients inspect session identity before parsing broadcast transcripts. Only locally subscribed sessions require deep validation; accepted events still pass the complete envelope parser.

[[src/packages/prime-agent/zenbu.ts#createZenbuPrimeAgentClient]] owns routing and listener cleanup. This avoids repeated transcript traversal in renderers that do not observe the session, without changing main-process broadcasts or attachment retention.

## Logical session isolation

One daemon client may carry several logical attachments. Each attachment keeps its own snapshot, events, commands, and disposal lifecycle.

[[src/packages/prime-workspace/index.ts#createPrimeWorkspace]] provides the renderer-facing attachment boundary. [[tests#Behavior specifications#Daemon boundary#Logical attachment isolation]] proves the daemon behavior.

## Daemon ownership

Ernie connects first and starts an already installed daemon only when the endpoint is absent. It never installs or terminates Prime Agent. `ERNIE_PRIME_AGENT_SOCKET` selects the endpoint.

[[src/main/prime-agent/service.ts#PrimeAgentService]] owns the main-process connection. [[development#Development workflow#Development profiles]] defines endpoint selection.

## External recovery

Failed reconnects preserve snapshots and pause commands. Recovery stops after three attempts; missing installations and incompatible greetings stop immediately. Explicit retry resets the budget.

[[src/main/prime-agent/recovery-retry.ts#runPrimeAgentRecoveryLoop]] bounds retries and stops during disposal. [[src/main/prime-agent/installed-daemon.ts#InstalledPrimeDaemon]] discovers installed executables and retains launched process lifetime. Startup readiness has a 30-second deadline.

Readiness is published only after the command recovery barrier clears. [[src/renderer/prime-query-recovery.ts#createPrimeQueryRecovery]] revalidates capability reads and failed snapshots once per successful connection generation, retaining cached values. Typed connection failures and failed root-selection attempts expire with that generation; unrelated action errors remain visible.

[[tests#Behavior specifications#Development boundary#Browser recovery]] proves session recovery.

The external daemon and socket survive cleanup, as required by [[tests#Behavior specifications#Daemon boundary#External daemon ownership]].

## Connection footer

[[src/renderer/components/runtime-status.tsx#RuntimeStatus]] shows compact connection status and the Ernie version. A tooltip on the status separates the live Prime Agent version from the installed client version.

The footer owns one actionable recovery notice and preserves the existing retry action. It stays compact; selected-session restoration takes precedence over a ready daemon label, while unrelated action and send failures retain their own feedback. A failed refresh preserves an already-loaded transcript. The model trigger retains the accepted native model while the capability catalog recovers; it never inserts a fallback option or sends a model change.

## Composer inference settings

[[src/renderer/components/inference-controls.tsx#InferenceControls]] groups capability-driven effort choices and an RLM depth slider beside model selection. The controls retain accepted values and preserve unknown defaults.

[[src/renderer/components/session-inference-controls.tsx#SessionInferenceControls]] reads live effort capabilities from the snapshot and depth from the existing per-chat RPC. Rejected changes retain prior values. [[src/renderer/components/draft-composer-controls.tsx#DraftComposerControls]] stores optional choices in Agent settings and clears unsupported effort when the selected model changes.

## Service shutdown

Shutdown rejects new attachment acquisition, closes the shared transport, and joins pending attachment and recovery work before cleanup completes.

[[src/main/prime-agent/service.ts#PrimeAgentService]] releases acquisitions that finish during disposal. Closing the client rejects pending native requests without issuing daemon shutdown. [[tests#Behavior specifications#Daemon boundary#Service disposal]] verifies this boundary.

## Daemon integration reference

The [daemon docs](../docs/prime-agent/README.md) separate Ernie ownership from upstream capability, including version evidence and recovery limits.

The [API reference](../docs/prime-agent/api/README.md) inventories installed command fields and client methods, with Ernie service signatures and example ownership patterns.

## Saved Agent selection

Selecting a saved Agent keeps the active native session until root activation selects the replacement.

Automatic renderer reconnect attempts belong to the roster provider, so workspace remounts reuse the same attempt; failed attempts require explicit retry.

See `src/main/services/agents.ts`, `src/renderer/agent-state.tsx`, and `src/renderer/components/reconnect-agent.tsx`.

The depth slider previews changes locally and commits on release or keyboard completion. Zero disables subagents. Draft settings retain Use default; accepted depths above the usual slider range remain representable.

## Model settings panel

Composer model selection, reasoning, and RLM depth share a Model settings popover in both new and existing chats. The composer toolbar shows only the selected model trigger; inference state remains with its existing draft or session owner.

### Composer delivery choices

While working, Queue sends a native follow-up and Send now sends steering for the next interruption point. Enter queues by default. Pending messages come from session actions; receipt recovery preserves the original delivery mode.
