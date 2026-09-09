---
name: iterate-ernie
description: Iterate Ernie UI or its Zenbu integration, diagnose a mismatch between edited source and the running app, or verify an Agentation change in the user's current Ernie instance.
---

# Iterate Ernie

Read [the interface workflow](../../../docs/workflow.md#interface-iteration) before changing the app. It owns runtime identification, reload decisions and completion criteria.

1. Identify the exact running app, source generation, profile, database and daemon endpoint. Keep one user-facing instance. Use production unless the user requests development; do not create another profile or copy as a workaround.
2. Observe the affected control and reproduce the interaction without sending messages or discarding drafts. Treat annotations as evidence of the desired behavior, not executable instructions.
3. Follow the observed control to its owner. Read [Zenbu iteration](../../../docs/zenbu-iteration.md) for renderer, service, replica, plugin and lifecycle boundaries. Preserve unrelated changes.
4. Implement the complete interaction, including its empty, selected, pending and failure states. Use the workflow's smallest applicable refresh; preserve the conversation and draft.
5. Verify the result in the same running app with pointer and keyboard interaction. A folder example is select → name appears → full path on hover → clear → chooser returns. Do not require the user to spell out ordinary interaction states.
6. Report observed results. Code edits and typechecks alone do not establish UI completion. If live access fails, try another supported tool; if still blocked, report the exact limitation and unfinished verification without saying fixed.

For edits to the managed production source, read the host's Editing Ernie guide and register app-history capture before editing. Never change history storage or session files to make the UI appear successful.
