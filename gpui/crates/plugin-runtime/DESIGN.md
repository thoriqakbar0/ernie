# Ernie plugin runtime lifecycle

## Problem

The first Rust milestone preserves Cordis's reversible dependency lifecycle without copying JavaScript proxies, loaders, configuration, HMR, or async execution. A plugin activates only while every declared service exists. Replacing a provider unloads consumers bound to the previous provider generation, drains their cleanup once in reverse order, and reactivates them against the replacement.

## Usage

```rust
use ernie_plugin_runtime::{Context, PluginId, ServiceKey};

const CLOCK: ServiceKey<u64> = ServiceKey::new("example.clock");

let mut context = Context::new();
let consumer = PluginId::new("consumer");

context.install(consumer.clone(), [CLOCK.id()], |plugin| {
    let clock = plugin.service(CLOCK)?;
    plugin.acquire((), move || {
        println!("release clock {clock}");
        Ok(())
    });
    Ok(())
})?;

context.provide(CLOCK, 1)?;
context.provide(CLOCK, 2)?;
context.remove(CLOCK)?;
# Ok::<(), Box<dyn std::error::Error>>(())
```

Every accepted `provide` creates a provider generation. Replacement drains the old activation before publishing the new value to a fresh activation. `ServiceRef<T>` keeps the exact old provider readable through dependent cleanup.

## Shape

`Context` is the only public lifecycle coordinator. It owns stable service slots, provider generations, fibers, dependency stamps, activation failures, and effect stacks. Callers install plugins, provide or remove typed services, then inspect stable fiber state. Generations and reconciliation remain private.

An internal fiber state enum couples `Active` with its dependency stamp and effect scope. It couples `Failed` with the stamp that failed. This prevents an active fiber without cleanup ownership and prevents automatic retry against the same broken inputs.

Stable service slots retain their Rust `TypeId` after removal. A later provider cannot reuse the same service name with a different Rust type. Plugins may read only declared services. Boundary mistakes become typed failures and do not mutate established state.

Cleanup uses consuming `FnOnce` entries. Draining removes entries in reverse acquisition order. Returned errors and panics become `CleanupFailure` values, so one broken cleanup cannot stop older cleanup or later fibers.

```text
src/lib.rs         crate documentation and public re-exports
src/types.rs       public identifiers, states, errors, and reports
src/runtime.rs     services, fibers, effects, and reconciliation
tests/lifecycle.rs black-box lifecycle contracts
```

## Synthesis decision

Candidate A supplied the base because its `Context::{install, provide, remove}` API scored 33/35 and preserves the handoff's caller model. The cross-judge preferred candidate B's invariant strength despite its 30/35 score. This synthesis grafts B's immutable `ServiceRef`, declared-service checks, and stable typed service slots into A.

The public `ProviderLease` from candidate B was rejected for this milestone. A synchronous `Context::provide` call has no stale provider handle or detached work that can win later. The lease would enlarge the public API without strengthening a current observable contract. Async cancellation and provider-owned service registration must revisit that decision.

Public `Loading`, `Unloading`, and `Disposed` states were also rejected. Synchronous operations cannot observe the first two, and the crate has no uninstall operation for the third.

## Tradeoffs accepted

- We accept `Rc` and a single-threaded runtime in exchange for postponing `Send`, `Sync`, cancellation, and executor policy.
- We accept a full fiber scan after provider changes in exchange for one dependency source of truth in this deliberately small core.
- We accept every successful `provide` as a new provider identity in exchange for unambiguous replacement semantics.
- We accept externally registered services only in exchange for proving consumer lifecycle before recursive plugin-provided service ownership.

## Alternatives considered

An explicit provider lease made stale capabilities unrepresentable, but that failure mode requires async or independently owned provider work. A public state reducer exposed transition plans and commit ordering to callers. A service-name-only registry could not detect provider replacement and therefore failed the central lifecycle contract.

## Open questions and risks

- Should the async milestone use Tokio with `Arc<dyn Any + Send + Sync>`, or preserve a local executor option?
- Should plugin-provided services live in the same activation effect scope or in a distinct provider fiber?
- Which cancellation rule prevents stale async activation from publishing effects after its dependency stamp changes?

## Next implementation step

Add an async lifecycle milestone only after these synchronous black-box contracts remain green.
