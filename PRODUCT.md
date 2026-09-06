# Ernie

Ernie is a local desktop workspace for directing Prime Agent roots and inspecting their work.

## Current model

Each Agent binds to one persisted native root. Prime Agent owns execution, configuration, names, transcripts, and descendants. Ernie owns appearance, favorites, navigation, drafts, and command feedback.

Sending continues the bound root. Missing roots remain unavailable until recovered; Ernie must not replace them silently. Legacy sessions retain their identity and provenance.

The production interface runs in browser development and Electron through the same Zenbu service boundary. It exposes real session state, including pending sends, cancellation, reconnects, and failures.

## Product requirements

- Keep the selected Agent, workspace, and execution state identifiable.
- Preserve drafts and feedback when navigation changes.
- Make failure recovery actionable without inventing completion or progress.
- Support keyboard navigation, narrow windows, and reduced motion.

[ADR 0002](docs/adr/0002-native-agent-roots.md) owns the root model. [UI guidance](docs/ui.md) owns interaction and visual rules. [Architecture](docs/architecture.md) and [data structures](docs/data-structures.md) describe the implementation boundaries.

Routines, root reset/fork, external root import, and task surfaces need separate product decisions before implementation.
