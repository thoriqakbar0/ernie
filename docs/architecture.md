# Architecture for changes

Use this guide when a change affects state ownership, component boundaries, or runtime integration. The [architecture map](../lat.md/architecture.md) links current responsibilities to source code. This guide explains how to extend those boundaries.

## Current structure and product direction

Ernie currently renders Prime Agent sessions through React and Zenbu. The [domain map](../lat.md/domain.md) describes session admission, synchronization, and renderer projection.

Read [data structures](data-structures.md) for contract relationships, identifiers, revisions, and state lifetime.

[ADR 0001](adr/0001-persistent-agent-product-model.md) defines the accepted direction toward persistent Agents and related conversations. It is a target product model, not evidence that those capabilities exist. UI development improvements do not authorize that product migration.

## Ownership

Assign each value and effect one owner before changing its presentation:

| Responsibility | Owner | Change rule |
| --- | --- | --- |
| Session execution and transcript | Prime Agent, exposed through Ernie’s main-process boundary | Use authoritative snapshots and ordered updates |
| Catalog and selected session | Revisioned state published by `PrimeAgentService` | Keep selection and catalog changes consistent |
| Renderer subscriptions, cache, and commands | `PrimeAgentStateProvider` and its runtime | Expose focused hooks; keep transport mechanics here |
| Feature interaction | Workspace, composer, transcript, and navigation components | Coordinate behavior within the affected feature |
| Temporary presentation | The nearest component that owns its lifetime | Keep menu visibility and similar state local |
| Shared appearance and controls | StyleX theme, colocated style modules, and `components/ui/` | Reuse established styles and interaction behavior |

Derived values stay derived. A renderer cache mirrors server state; it does not create another authority for that state.

Draft lifetime needs an explicit decision. `PrimeSessionWorkspace` currently owns draft text locally and remounts on session selection. Cross-session draft retention requires a session-keyed owner that survives that remount. Do not infer retention from session isolation.

## Component boundaries

Extract a component when it owns a coherent interaction or an established repeated pattern. Keep feature policy with the feature. Shared controls own reusable interaction and appearance, not session commands.

Use the existing dependencies and public package entry points. Add a boundary when it hides real policy, resource ownership, or external translation. A folder or wrapper alone does not establish that boundary.

Follow the [StyleX map](../lat.md/styling.md) for component styles and theme values. Keep document defaults in `main.css`.

## Development scenarios

Controlled scenarios should render production components through the existing client boundary. `PrimeAgentStateProvider` accepts a client and workspace-path provider. The development-only mock accepts initial snapshots.

These source capabilities do not establish an available scenario launcher or complete scenario coverage. Inspect the current wiring before using them. Add only the scenario support required by the authorized change.

Keep fixtures and their actions separate from live sessions. Give subscriptions, timers, and pending operations explicit cleanup. Scenario behavior verifies presentation; live runtime evidence verifies integration.

## Recording a decision

Update the linked `lat.md/` section when ownership or a runtime contract changes. Use an ADR for a durable decision with alternatives and consequences. Keep transient debugging notes and screenshot paths in the task handoff.

For visual behavior, read [UI guidance](ui.md). For the inspect, edit, and review sequence, read the [development workflow](workflow.md).
