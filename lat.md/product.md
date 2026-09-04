# Product contract

Ernie helps a developer direct several Prime Agent sessions without losing the selected workspace, transcript, or runtime state.

The detailed product source is [PRODUCT.md](../PRODUCT.md). The interaction source is [docs/ui.md](../docs/ui.md), and the visual rules are [DESIGN.md](../DESIGN.md).

## Session continuity

Selecting a session changes its heading, transcript, activity, composer, and current marker together. Drafts and messages never cross session boundaries.

[[src/renderer/prime-agent-state.tsx#PrimeAgentStateProvider]] owns renderer selection and session state.

## Runtime states

Working, recovering, reconnecting, and failed states change visible actions and messages. The UI never invents progress, permission, or completion data.

These states depend on the authoritative contract in [[runtime#Prime Agent runtime#Snapshot authority]].

## Responsive workspace

The same production components run in browser development and Electron. Narrow windows move session navigation and activity into document flow.

[[src/renderer/components/app.tsx#App]] defines the main renderer layout.

## Product boundaries

The current UI does not add rename, archive, delete, retry, or permission commands. It does not replace the Prime Agent protocol or Zenbu view structure.
