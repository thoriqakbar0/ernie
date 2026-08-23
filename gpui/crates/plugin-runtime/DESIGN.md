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

## Async milestone

The async runtime will preserve a local executor path. The core will return a local driver future without depending on Tokio or GPUI. This keeps `Rc` services and non-`Send` plugin futures valid. The existing synchronous `Context` remains available beside the new async runtime.

One driver will own the service registry, fibers, provider generations, and lifecycle transitions. Each activation task will receive an immutable service snapshot and a private draft containing provisional effects and services. Activation tasks will never mutate authoritative runtime state directly.

Plugin-provided services will use distinct internal provider identities owned by their committed activation. These provider records are not independent tasks or public fibers. A successful activation will publish its complete provider set atomically. Retirement will remove those providers, unload and clean their dependents, then drain the provider activation's remaining effects.

Each attempt will carry an activation ticket containing its plugin identity, attempt identity, and dependency stamp. A completion may commit only when the fiber is loading that exact ticket, the current dependency stamp still matches, and the ticket has not been revoked. Cancellation reduces wasted work but does not establish correctness. A stale success or failure will drain its private draft exactly once without publishing services, attaching effects, or replacing newer state.

The async contract tests will cover local non-`Send` activation, provisional and atomic provider publication, stale success, stale failure, rapid dependency changes, provider retirement order, generation-fixed cleanup references, and shutdown cleanup reporting. The existing synchronous lifecycle suite remains mandatory.

## Async milestone status

The first async slice adds `AsyncContext` and the executor-neutral `LocalDriver` beside the synchronous `Context`. Each activation owns an `ActivationTicket`, an immutable service snapshot, and a private `ActivationDraft`.

The driver revokes stale tickets and offers each activation a cooperative `Cancellation` signal. Compare-and-commit remains the correctness rule. Stale successes and failures drain their drafts before one retry starts against the latest complete dependency stamp.

Async cleanup runs as a polled lifecycle transition. The driver continues to accept commands while cleanup waits. Dropping every `AsyncContext` starts orderly shutdown and returns the final `LifecycleReport` from `LocalDriver`.

Eight async black-box tests cover the implemented slice. The existing 11 synchronous lifecycle tests remain green.

Plugin-provided services remain outside this slice. The next slice will add private provider identities, atomic publication, and provider retirement order.
