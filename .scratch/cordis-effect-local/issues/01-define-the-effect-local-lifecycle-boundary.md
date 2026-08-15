# Define the effect-local lifecycle boundary

Parent: [Bring effect-local lifecycle cleanup to Ernie](../map.md)

Label: `wayfinder:grilling`

Assignee: codex

Status: closed

Blocked by: none

## Question

What counts as an effect in Ernie, which host registrations and plugin resources must enter one recovery ledger, and which canonical terms and invariants define that lifecycle boundary?

## Resolution comment

The **effect-local lifecycle** is the ownership boundary for reversible changes made through `PluginActivationContext` during one activation attempt.

- One activation attempt owns one ordered **effect ledger**.
- Commands, views, and explicit context-mediated acquisitions are **plugin effects** in that ledger.
- Staged commands and views become observable only after activation succeeds.
- A custom acquisition registers adjacent cleanup before another effect begins.
- An acquisition that fails after partial work reverses that work before throwing.
- Activation failure, disable, and host disposal drain armed cleanup in reverse order.
- Recovery consumes each cleanup before invoking it, so no later teardown path invokes it again.
- Re-enabling a plugin creates a new activation attempt and a new ledger.
- Work performed later by command handlers or rendered views is outside the activation ledger unless it creates another context-mediated effect.
- External emissions remain outside reversible recovery unless the plugin registers explicit compensation through the context.
- React and Electron-main resources remain outside this boundary until their ownership routes through the context.

Cleanup error propagation and lifecycle concurrency policy remain with [Define cleanup failure and concurrency semantics](./04-define-cleanup-failure-and-concurrency-semantics.md).
