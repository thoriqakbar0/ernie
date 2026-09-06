# Development workflow

Use browser HMR for UI iteration and keep the current service host alive. [AGENTS.md](../AGENTS.md#ui-iteration) owns test, build, and Electron restart permissions; [README](../README.md#development) owns launch commands.

1. Confirm the checkout, branch, local changes, and running profile.
2. Reproduce the issue at the relevant viewport with known data.
3. Follow `lat search`, `lat section`, and `lat refs` to the owning code.
4. Change that boundary and inspect the affected interaction, including failure and keyboard behavior.
5. Report what changed, what was verified, and remaining limits.

Keep UI decisions in [ui.md](ui.md), ownership in [architecture.md](architecture.md), and protocol invariants in [data-structures.md](data-structures.md). Put transient screenshots, timings, and session identifiers in the task handoff.

## Browser scenarios

Use the existing development server with `?browser=1&scenario=agents` or `?browser=1&scenario=workspaces`. These routes reuse production components with isolated clients. Changing presets resets fixture state; no live commands should be sent.

| Scenario controls | Exercise |
| --- | --- |
| Empty, Populated, Long names, Concurrent activity | Navigation, layout, and state distinctions |
| New Agent, Reject mutations, Slow creation and attachment | Creation rejection, retries, and navigation during admission |
| Reject sends, Slow sends, Long conversation | Draft retention, delayed responses, and reading positions |
| Tool activity, Reconnect, Failed connection | Tool output and unavailable commands |
| Workspace Selection failure, Slow selection, Long paths | Retry, pending selection, and wrapping |
| Four-model catalog | Empty filters and focus recovery |

For send recovery, enable Lose send acknowledgement, send once, disable it, then choose Check send. Expect one message or queued item. Edit the draft before recovery and confirm newer text survives. Disconnect Prime Agent and confirm receipt inspection remains available while new sends are disabled.

Context-provider edits can invalidate consumers during HMR. If a missing-provider error appears, reload that browser tab while keeping the host alive. Report this separately from uninterrupted HMR.

See [verification](verification.md) for integration boundaries and known coverage gaps.
