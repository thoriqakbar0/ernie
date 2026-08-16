# Ernie

Ernie provides an agent workspace with an automation boundary for its visible application state.

## Language

**UI control**:
The automation boundary through which people and agents inspect or change Ernie's visible application state.
_Avoid_: Agent harness, agent runtime

**UI capability**:
A typed set of related UI control commands, inputs, state, and handlers registered by one feature.
_Avoid_: State path, arbitrary mutation, natural-language action

**Capability manifest**:
The machine-readable catalog of UI capabilities and the commands each one exposes.
_Avoid_: Help text, plugin command list

**UI control result**:
The stable response envelope for a UI control command, carrying typed capability data or a structured error.
_Avoid_: Output text, message

**Effect-local lifecycle**:
The ownership boundary that ties context-mediated plugin effects to one activation attempt and its recovery.
_Avoid_: Cordis compatibility, plugin lifetime

**Plugin effect**:
A reversible change made through `PluginActivationContext` during one activation attempt. Later handler work is separate unless it creates another context-mediated effect.
_Avoid_: Side effect, plugin resource

**Effect ledger**:
The activation attempt's ordered record of armed plugin-effect cleanups. Recovery consumes each entry before invoking it once in reverse order.
_Avoid_: Root disposable, cleanup bag

**Repository navigation**:
The visible hierarchy that organizes repositories, worktrees, and Agent conversations through selection, ordering, pins, archive, search, and disclosure.
_Avoid_: Sidebar state, thread tree

**Agent conversation**:
One visible body of work between a person and an Agent, whether active or saved.
_Avoid_: Thread, Prime Agent session
