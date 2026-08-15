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
