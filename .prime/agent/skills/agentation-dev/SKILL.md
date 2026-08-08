---
name: agentation-dev
description: Read and manage Agentation visual-feedback sessions for Ernie through the local Agentation service. Use when checking pending annotations, watching for new design feedback, replying to annotation threads, or resolving visual feedback in this project.
---

# Agentation Dev

The Ernie toolbar syncs to the local Agentation service at `127.0.0.1:4748`.

Discover feedback before acting:

```python
await agentation_dev.list_sessions()
await agentation_dev.get_pending()
await agentation_dev.get_session(session_id)
```

For hands-free feedback, use `await agentation_dev.watch(...)`. Acknowledge an item before changing code, then resolve it with a concrete summary. Use `dismiss` only with a reason and `reply` when clarification is needed.

All calls are restricted to the fixed loopback Agentation service. Start it with `pnpm agentation:server` if a call reports a connection failure.
