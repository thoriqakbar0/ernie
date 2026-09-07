# Application history

The installed desktop host owns local checkpoints and recovery for editable Ernie source. People and agents use one controller; developer workspaces and user data are outside restoration.

## Controller and source boundary

Stable source capture publishes content-addressed checkpoints under an immutable manifest. Generation switching preserves the previous app and its data path.

[[src/host/history/controller.ts#HistoryController]] serializes mutations and records restoration state. [[src/host/history/source-store.ts#SourceStore]] enforces the capture manifest and verifies objects. [[src/packages/app-history/index.ts#HistoryRequest]] defines the public request grammar, which excludes activation.

Capture rejects symlinked ancestors of nested manifest entries. Restore installs frozen dependencies and checks the prepared source identity before activation. Finished editing intervals retain their summaries independently of deduplicated source trees.

## Independent recovery

The bundled parent process survives editable application startup failures. It owns native approval, generation opening, and readiness checks.

[[src/host/history/desktop.ts#startHistoryDesktop]] opens the recovery window and supervises the editable child. Only its native confirmation can call controller approval. The launcher retains the selected generation and offers bundled official updates for review.

## Separate application pages

Settings contains Customize and App history tabs. Conversation state remains mounted while the user inspects application checkpoints.

[[src/renderer/app-navigation.tsx#AppNavigationProvider]] owns page navigation. [[src/renderer/components/app-history-page.tsx#AppHistoryPage]] reads controller facts, displays checkpoint differences, and requests approval through the independent host.

## Agent access

The local authenticated socket, CLI, and stdio MCP share checkpoint identities and errors. Editing clients register an interval before changing the managed application.

[[src/host/history/transport.ts#serveHistory]] accepts only local authenticated requests. [[src/host/history/agent-cli.ts#agentMain]] exposes protocol operations and the bundled guide. [[src/main/prime-agent/history-admission.ts#admitHistoryTurn]] gates managed-source dispatch on a completed baseline capture.

Admission follows fallible session preparation. Uncertain dispatch retains its editing interval until resolved; inactive managed roots cannot admit new work.

## Customization entry

Settings leads with a customization card and a compact history row. Controller availability gates customization; browser development shows labeled example history inside the App history tab.

Suggested changes open an editable conversation draft without sending. The history row reports capture failures, pending source changes, or the latest checkpoint time.
