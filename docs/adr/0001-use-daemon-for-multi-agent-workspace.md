---
status: proposed
---

# Use Prime Agent daemon control for the multi-worktree workspace

Ernie will move workspace orchestration from one singleton `--mode rpc` process to Prime Agent’s daemon session protocol while keeping runtime authority in Electron main. The singleton RPC surface is excellent for one chat but cannot discover worktrees and subagents, attach multiple live roots, or keep tabs across independent sessions; the daemon can list, create, attach, detach, and route events by active session without inventing those relationships in the renderer.

The cost is a deeper adapter and explicit capability negotiation. Raw daemon records and local paths remain confined to main, and closing a tab detaches its view rather than killing the underlying agent.
