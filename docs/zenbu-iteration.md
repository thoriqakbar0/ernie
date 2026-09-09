# Iterate the Zenbu layer in Ernie

Keep the running application and its editable source matched while changing one behavior at a time.

## Identify the target

Record the executable, source generation, profile and Prime socket using live process information and the managed host's history.status. Repository cwd is not proof of the app's source. A production history restore can change the active generation. Recheck it before editing.

Keep one user-facing Ernie instance. A recovery parent and renderer child are expected processes within that instance. Do not start a second app, copy or profile to avoid diagnosing the first. Existing data remains in place unless migration is requested.

## Find the owner

| Concern | Owner to inspect |
| --- | --- |
| Visible controls, layout, drafts | `src/renderer/components`, local interaction state |
| Synchronized domain state | Existing Zenbu replica and service; do not add a parallel cache |
| Agent roster and persistence | `src/main/services/agents.ts`, `agent-store.ts`, configured database |
| Native sessions, sends, models | `src/main/prime-agent`, installed Prime protocol |
| Plugin registration and packaging | `zenbu.plugin.ts`, `zenbu.config.ts`, installed Zenbu APIs |
| Production source and recovery | `src/host/history`, packaged launcher, history.status |

Read architecture.md and the installed Zenbu reference for the boundary being changed. Do not replace framework behavior based on a guessed API.

## Make the change visible

- Renderer edit: use the current runtime's supported update path. In an explicitly selected development session, HMR may apply it. In production, observe whether the host recompiles and reloads; never infer it from a file write.
- Stale renderer: refresh only the affected app renderer after preserving its draft. Refreshing the embedded browser reloads its website, not Ernie.
- Main service, plugin registration or configuration edit: a renderer refresh cannot replace the main process. Use an authorized restart of the same app/profile; do not change versions to load the edit.
- Packaged recovery host or launcher edit: it requires an authorized packaged rebuild/install. Editable app-source changes do not modify the host.

Before reporting success, observe the changed control in the same app and exercise its complete interaction. Record source-only checks separately. A disconnected provider, unknown model or rejected send must show the actionable cause; do not disguise it as an uncertain acknowledgement.

## Prime Agent discovery

Ernie passes the bundled ernie-skill and iterate-ernie skills through native session configuration's `skills` field and adds a short `appendSystemPrompt` pointer. Existing Agent instructions remain appended. This applies to Ernie-configured sessions, not global Prime settings or independently launched CLI sessions.

The skill and referenced docs must be included in source distribution and history capture. Existing workers need to be reopened through Ernie to receive updated configuration; editing this file cannot retroactively change their prompt.
