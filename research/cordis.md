# Cordis and spatiotemporal composability

Research date: 2026-08-15

Status: living note. The paper is a preprint under active revision.

## Research question

Can Cordis's lifecycle model improve Ernie's plugins without making Ernie adopt Cordis wholesale?

## Sources

- DeepSeek Harness, [Cordis Primer](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer), accessed 2026-08-15.
- DeepSeek Harness, [primer source at `47f9438`](https://github.com/deepseek-ai/DeepSeek-Harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cordis-primer.md).
- Yifan Shi, Wei Zhang, and Tianyi Cui, [A Programming Paradigm for Spatiotemporal Composability](https://github.com/cordiverse/paper/blob/948a07b369c62adb3b12e102458be5c18dfb69b9/paper.pdf), draft of 2026-08-13.
- Cordiverse, [paper repository at `948a07b`](https://github.com/cordiverse/paper/tree/948a07b369c62adb3b12e102458be5c18dfb69b9).

The commit links make this snapshot reproducible. Recheck the live sources before relying on later claims.

## Working thesis

Cordis treats dynamic composition as two connected problems:

- temporal composability removes a component and reverses its effects;
- spatial composability reacts when a component's required services appear, disappear, or change.

The practical mechanism joins both dimensions in one context. Components modify that context through tracked effects and declare dependencies as coeffects.

## The primer in five ideas

| Idea | Meaning |
| --- | --- |
| Plugin | A function or `Service` subclass mounted into a context. |
| Context | A service repository with stable keys such as `ctx.tools` or `ctx.sessions`. |
| Injection | Required services delay activation until providers exist. |
| Typed events | `emit`, `waterfall`, `parallel`, and `serial` define distinct dispatch contracts. |
| Reversible registration | `ctx.effect()` and `ctx.on()` bind registration to automatic teardown. |

The primer's most important rule is locality. Resource acquisition and cleanup stay together inside one effect.

Waterfall events act as around-middleware. A listener delegates with `next()` or short-circuits by returning directly.

## What the paper adds

### Revertible effects

An effect carries its inverse. The runtime accumulates inverses and applies them in last-in, first-out order during recovery.

This gives composition a structural cleanup rule. It does not prove each author-supplied inverse is correct.

### Reactive coeffects

A component declares the context values it needs. Context changes classify the component as activating, deactivating, or unchanged.

A provider withdrawal deactivates dependents before the provider releases its own effects. This keeps dependencies readable during dependent teardown.

### Unified context

The context stores services, dependency resolution, effect recovery, isolation, and interception. It becomes the component's lifecycle boundary.

### Component lifecycle

Cordis models each component instance as a fiber. A fiber tracks target dependencies, committed dependencies, lifecycle state, and accumulated cleanup.

Reload and unload are inertial. A transition finishes before another target change starts, even when cleanup is asynchronous.

### Declarative loader and HMR

The loader reconciles a persistent configuration tree into fibers. It handles configuration changes with the least disruptive operation.

Hot module replacement removes stale fibers, reloads modules, and restores cached modules when replacement fails.

### System boundary

Only effects inside the controlled system boundary can be reversed. External emissions need withholding or application-specific compensation.

Closing a file handle is revertible. Retracting bytes already observed by another process usually is not.

### Security boundary

Declared dependencies resemble capability requests, but context mediation is not a sandbox. Untrusted code still needs a separate execution boundary.

### Evidence limit

The paper's production evidence comes from Koishi and its plugin ecosystem. It is an existence-and-adoption result, not a controlled comparison.

## Comparison with Ernie today

| Concern | Ernie plugin host | Cordis model | Research implication |
| --- | --- | --- | --- |
| Activation | Lazy and transactional for declared commands and views. | Reactive when injected services become available. | Preserve Ernie's transactional publication. Study reactive activation separately. |
| Cleanup | One optional plugin-owned `dispose()` method. | Every context-mediated effect contributes an inverse. | Test smaller, composable cleanup units instead of one manual root cleanup. |
| Dependencies | No plugin-to-plugin service dependency graph. | Services use stable keys and declared injection. | Prototype one provider-consumer pair before changing manifests. |
| Provider removal | Disables one plugin and removes its own contributions. | Deactivates dependents before releasing the provider. | Test teardown ordering and dependency visibility. |
| Rapid changes | Waits for activation or deactivation during enable and disable. | Uses inertial lifecycle transitions and target recomputation. | Stress provider replacement during asynchronous activation and cleanup. |
| Security | Trusted built-ins only; no third-party sandbox. | Context access limits declared capabilities; sandboxing remains external. | Do not treat dependency injection as permission isolation. |
| Reload | Restore activates a plugin again after disable. | Loader reconciles configuration and supports transactional HMR. | Defer HMR until lifecycle and dependency experiments pass. |

Ernie already has useful temporal foundations. Transactional contribution publication prevents partial commands or views after failed activation.

Its disposable remains coarse-grained and author-managed. The host does not react to dependencies because it does not model services yet.

## What Ernie should implement first

Keep the current plugin host's outer transaction. Add Cordis-style ownership through one narrow production lifecycle boundary.

1. Give each activation attempt one effect ledger.
2. Acquire values and cleanup together through `PluginActivationContext.acquire`.
3. Drain acquired effects once in reverse order on failure, disable, or disposal.
4. Keep commands and views staged until activation validates successfully.
5. Reject registration and acquisition after activation closes.
6. Defer provider-consumer dependencies until a real cross-plugin service requires them.

## Success criteria

- Each context-mediated acquisition owns an adjacent cleanup function.
- Failed or interrupted activation leaves no registered contributions or resources.
- Cleanup runs once in deterministic reverse order.
- A consumer never activates without every required service.
- A departing provider remains readable until each dependent finishes teardown.
- Repeated provider changes converge without overlapping lifecycle transitions.
- External emissions remain explicitly outside the recovery guarantee.

## Open questions

- Which Ernie capabilities deserve service keys: sessions, tools, browser state, or agent adapters?
- Should service dependencies live in the manifest or only in executable plugin code?
- How should expected cleanup failures appear in Ernie's typed result model?
- Can Ernie preserve its contribution transaction while effects register incrementally?
- Which resources can Ernie truly restore, and which only support compensation?
- Would a dependency graph clarify the host or exceed this learning lab's useful scope?
- What sandbox boundary would be required before loading third-party plugin code?

## Reading path

1. Read the primer for working vocabulary.
2. Read paper sections 1 and 3 for the two composability dimensions.
3. Read section 5 for `ctx.effect`, fibers, reconciliation, and HMR.
4. Read sections 6.1, 6.3, 6.5, and 6.6 for the model's limits.
5. Return to section 4 only when the lifecycle prototype needs formal justification.

## Current conclusion

Cordis is most valuable to Ernie as a design lens, not an immediate dependency.

Ernie now adopts effect-local cleanup in plugin API v2 of the production host. The version boundary makes every v2 cleanup exactly once. Provider-aware teardown remains the next experiment. HMR and self-evolution should wait.
