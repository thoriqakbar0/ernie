# Application history

The installed desktop host owns local checkpoints and recovery for editable Ernie source. People and agents use one controller; developer workspaces and user data are outside restoration.

## Controller and source boundary

Stable source capture publishes content-addressed checkpoints under an immutable manifest. Generation switching preserves the previous app and its data path.

[[src/host/history/controller.ts#HistoryController]] serializes mutations and records restoration state. [[src/host/history/source-store.ts#SourceStore]] enforces the capture manifest and verifies objects. [[src/packages/app-history/index.ts#HistoryRequest]] defines the public request grammar, which excludes activation.

Checkpoint tree hashes include file-entry JSON field order: path, hash, size, executable. Schema decoding and capture retain that order so existing checkpoints remain verifiable.

Capture rejects symlinked ancestors of nested manifest entries. Restore installs frozen dependencies and checks the prepared source identity before activation. Finished editing intervals retain their summaries independently of deduplicated source trees.

## Independent recovery

The bundled parent process survives editable application startup failures. It owns native approval, generation opening, and readiness checks.

[[src/host/history/desktop.ts#startHistoryDesktop]] opens the recovery window and supervises the editable child. Only its native confirmation can call controller approval. The launcher retains the selected generation and offers bundled official updates for review.

## Separate application pages

Settings uses Base UI tabs for Appearance and App history, with URL-controlled selection and separate accessible panels. Conversation state remains mounted while the user inspects application checkpoints.

[[src/renderer/app-navigation.tsx#AppNavigationProvider]] owns page navigation. [[src/renderer/components/app-history-page.tsx#AppHistoryPage]] reads controller facts, displays checkpoint differences. Independent host recovery retains restore approval.

Normal development settings use the same history service. Unsupported workspaces show “No app history to show.” without a retry action; other failures retain feedback and retry. Synthetic checkpoints require an explicit development `scenario=history` URL. Empty history and unknown unsaved-change status remain explicit.

## Agent access

The local authenticated socket, CLI, and stdio MCP share checkpoint identities and errors. Editing clients register an interval before changing the managed application.

[[src/host/history/transport.ts#serveHistory]] accepts only local authenticated requests. [[src/host/history/agent-cli.ts#agentMain]] exposes protocol operations and the bundled guide. [[src/main/prime-agent/history-admission.ts#admitHistoryTurn]] gates managed-source dispatch on a completed baseline capture.

Admission follows fallible session preparation. Uncertain dispatch retains its editing interval until resolved; inactive managed roots cannot admit new work.

## Appearance and customization

Settings exposes local appearance preferences and App history. Managed-source customization remains a backend capability without a Settings disclosure.

[[src/main/services/app-history.ts#AppHistoryService]] retains the customization service and existing managed-source Agent workflow.

[[src/renderer/components/appearance-settings.tsx#AppearanceSettings]] reports successful preference writes and retries only failed preference groups. Local preferences are outside source checkpoints. The App history page retains checkpoint browsing and recovery feedback.

## Checkpoint inspection

History separates saving from recovery. A grouped checkpoint list distinguishes current and selected entries; each row expands inline to inspect metadata and source.

The compact header contains Save checkpoint and an actions disclosure for refresh and previous-state inspection. Status sits below the list. Screenshot stacks show an explicit empty state because checkpoint data has no image capture. Compact metadata keeps exact timestamps and origins in details.

## Preview source completeness

The capture manifest includes release.json because packaged source configuration reads it at startup. Preview packaging supplies distinct source and history roots while retaining the shared Prime Agent daemon.

Settings uses restrained rows with responsive label/control alignment, font previews under their controls, and shared theme tokens. History progress, empty notices, and recoverable errors use the presentation-only HistoryFeedback component; runtime loading and retry ownership remain in AppHistoryPage.
