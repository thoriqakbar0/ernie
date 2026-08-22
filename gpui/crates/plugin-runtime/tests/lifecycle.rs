use std::cell::{Cell, RefCell};
use std::rc::Rc;

use ernie_plugin_runtime::{
    CleanupError, Context, FiberState, LifecycleError, PluginError, PluginId, ServiceKey,
};

const CLOCK: ServiceKey<u64> = ServiceKey::new("example.clock");

#[test]
fn waits_for_every_requirement_before_activation() {
    const REGION: ServiceKey<&str> = ServiceKey::new("example.region");
    let activations = Rc::new(Cell::new(0));
    let observed = Rc::clone(&activations);
    let plugin = PluginId::new("consumer");
    let mut context = Context::new();

    context
        .install(plugin.clone(), [CLOCK.id(), REGION.id()], move |ctx| {
            assert_eq!(*ctx.service(CLOCK)?, 7);
            assert_eq!(*ctx.service(REGION)?, "ap-southeast");
            observed.set(observed.get() + 1);
            Ok(())
        })
        .expect("plugin id is unique");

    assert_eq!(context.state(&plugin), Some(FiberState::Pending));
    context.provide(CLOCK, 7).expect("clock type is stable");
    assert_eq!(activations.get(), 0);
    context
        .provide(REGION, "ap-southeast")
        .expect("region type is stable");
    assert_eq!(activations.get(), 1);
    assert_eq!(context.state(&plugin), Some(FiberState::Active));
}

#[test]
fn provider_replacement_cleans_old_activation_before_loading_new_value() {
    let events = Rc::new(RefCell::new(Vec::new()));
    let observed = Rc::clone(&events);
    let mut context = Context::new();

    context
        .install(PluginId::new("consumer"), [CLOCK.id()], move |ctx| {
            let clock = ctx.service(CLOCK)?;
            observed.borrow_mut().push(format!("activate {}", *clock));
            let cleanup_events = Rc::clone(&observed);
            ctx.acquire((), move || {
                cleanup_events
                    .borrow_mut()
                    .push(format!("cleanup {}", *clock));
                Ok(())
            });
            Ok(())
        })
        .expect("plugin id is unique");

    context.provide(CLOCK, 1).expect("clock type is stable");
    context.provide(CLOCK, 2).expect("clock type is stable");

    assert_eq!(*events.borrow(), ["activate 1", "cleanup 1", "activate 2"]);
}

#[test]
fn removal_drains_cleanup_once_in_reverse_order() {
    let events = Rc::new(RefCell::new(Vec::new()));
    let observed = Rc::clone(&events);
    let plugin = PluginId::new("consumer");
    let mut context = Context::new();

    context
        .install(plugin.clone(), [CLOCK.id()], move |ctx| {
            let first = Rc::clone(&observed);
            ctx.acquire((), move || {
                first.borrow_mut().push("first");
                Ok(())
            });
            let second = Rc::clone(&observed);
            ctx.acquire((), move || {
                second.borrow_mut().push("second");
                Ok(())
            });
            Ok(())
        })
        .expect("plugin id is unique");

    context.provide(CLOCK, 1).expect("clock type is stable");
    context.remove(CLOCK).expect("clock type is stable");
    context.remove(CLOCK).expect("second removal is idempotent");

    assert_eq!(*events.borrow(), ["second", "first"]);
    assert_eq!(context.state(&plugin), Some(FiberState::Pending));
}

#[test]
fn cleanup_failures_do_not_stop_older_effects() {
    let events = Rc::new(RefCell::new(Vec::new()));
    let observed = Rc::clone(&events);
    let mut context = Context::new();

    context
        .install(PluginId::new("consumer"), [CLOCK.id()], move |ctx| {
            let first = Rc::clone(&observed);
            ctx.acquire((), move || {
                first.borrow_mut().push("first");
                Ok(())
            });
            let second = Rc::clone(&observed);
            ctx.acquire((), move || {
                second.borrow_mut().push("second");
                Err(CleanupError::new("second failed"))
            });
            Ok(())
        })
        .expect("plugin id is unique");

    context.provide(CLOCK, 1).expect("clock type is stable");
    let report = context.remove(CLOCK).expect("clock type is stable");

    assert_eq!(*events.borrow(), ["second", "first"]);
    assert_eq!(report.cleanups.len(), 1);
    assert_eq!(report.cleanups[0].sequence, 2);
    assert_eq!(report.cleanups[0].error.message(), "second failed");
}

#[test]
fn cleanup_failure_does_not_stop_other_dependents() {
    let events = Rc::new(RefCell::new(Vec::new()));
    let first_events = Rc::clone(&events);
    let second_events = Rc::clone(&events);
    let mut context = Context::new();

    context
        .install(PluginId::new("first"), [CLOCK.id()], move |ctx| {
            let events = Rc::clone(&first_events);
            ctx.acquire((), move || {
                events.borrow_mut().push("first");
                Err(CleanupError::new("first failed"))
            });
            Ok(())
        })
        .expect("plugin id is unique");
    context
        .install(PluginId::new("second"), [CLOCK.id()], move |ctx| {
            let events = Rc::clone(&second_events);
            ctx.acquire((), move || {
                events.borrow_mut().push("second");
                Ok(())
            });
            Ok(())
        })
        .expect("plugin id is unique");

    context.provide(CLOCK, 1).expect("clock type is stable");
    let report = context.remove(CLOCK).expect("clock type is stable");

    assert_eq!(*events.borrow(), ["first", "second"]);
    assert_eq!(report.cleanups.len(), 1);
    assert_eq!(report.cleanups[0].plugin, PluginId::new("first"));
}

#[test]
fn cleanup_keeps_the_exact_provider_generation_readable() {
    let observed = Rc::new(Cell::new(None));
    let cleanup_observed = Rc::clone(&observed);
    let mut context = Context::new();

    context
        .install(PluginId::new("consumer"), [CLOCK.id()], move |ctx| {
            let clock = ctx.service(CLOCK)?;
            let result = Rc::clone(&cleanup_observed);
            ctx.acquire((), move || {
                result.set(Some(*clock));
                Ok(())
            });
            Ok(())
        })
        .expect("plugin id is unique");

    context.provide(CLOCK, 42).expect("clock type is stable");
    context.remove(CLOCK).expect("clock type is stable");

    assert_eq!(observed.get(), Some(42));
}

#[test]
fn remove_then_reprovide_reloads_the_consumer() {
    let values = Rc::new(RefCell::new(Vec::new()));
    let observed = Rc::clone(&values);
    let mut context = Context::new();

    context
        .install(PluginId::new("consumer"), [CLOCK.id()], move |ctx| {
            observed.borrow_mut().push(*ctx.service(CLOCK)?);
            Ok(())
        })
        .expect("plugin id is unique");

    context.provide(CLOCK, 1).expect("clock type is stable");
    context.remove(CLOCK).expect("clock type is stable");
    context.provide(CLOCK, 2).expect("clock type is stable");

    assert_eq!(*values.borrow(), [1, 2]);
}

#[test]
fn failed_activation_is_isolated_and_retries_after_provider_replacement() {
    let attempts = Rc::new(Cell::new(0));
    let observed_attempts = Rc::clone(&attempts);
    let healthy_runs = Rc::new(Cell::new(0));
    let observed_healthy = Rc::clone(&healthy_runs);
    let broken = PluginId::new("broken");
    let mut context = Context::new();

    context
        .install(broken.clone(), [CLOCK.id()], move |_| {
            observed_attempts.set(observed_attempts.get() + 1);
            if observed_attempts.get() == 1 {
                Err(PluginError::new("not ready"))
            } else {
                Ok(())
            }
        })
        .expect("plugin id is unique");
    context
        .install(PluginId::new("healthy"), [CLOCK.id()], move |_| {
            observed_healthy.set(observed_healthy.get() + 1);
            Ok(())
        })
        .expect("plugin id is unique");

    let first = context.provide(CLOCK, 1).expect("clock type is stable");
    assert_eq!(first.activations.len(), 1);
    assert_eq!(context.state(&broken), Some(FiberState::Failed));
    assert_eq!(healthy_runs.get(), 1);

    context.provide(CLOCK, 2).expect("clock type is stable");
    assert_eq!(attempts.get(), 2);
    assert_eq!(healthy_runs.get(), 2);
    assert_eq!(context.state(&broken), Some(FiberState::Active));
}

#[test]
fn failed_activation_rolls_back_acquired_effects_in_reverse_order() {
    let events = Rc::new(RefCell::new(Vec::new()));
    let observed = Rc::clone(&events);
    let plugin = PluginId::new("broken");
    let mut context = Context::new();

    let report = context
        .install(plugin.clone(), [], move |ctx| {
            let first = Rc::clone(&observed);
            ctx.acquire((), move || {
                first.borrow_mut().push("first");
                Ok(())
            });
            let second = Rc::clone(&observed);
            ctx.acquire((), move || {
                second.borrow_mut().push("second");
                Ok(())
            });
            Err(PluginError::new("activation failed"))
        })
        .expect("plugin id is unique");

    assert_eq!(*events.borrow(), ["second", "first"]);
    assert_eq!(report.activations.len(), 1);
    assert_eq!(context.state(&plugin), Some(FiberState::Failed));
}

#[test]
fn stable_service_slot_rejects_a_different_rust_type_without_state_change() {
    const WRONG_CLOCK: ServiceKey<String> = ServiceKey::new("example.clock");
    let plugin = PluginId::new("consumer");
    let activations = Rc::new(Cell::new(0));
    let observed = Rc::clone(&activations);
    let mut context = Context::new();

    context
        .install(plugin.clone(), [CLOCK.id()], move |_| {
            observed.set(observed.get() + 1);
            Ok(())
        })
        .expect("plugin id is unique");
    context.provide(CLOCK, 1).expect("clock type is stable");
    context.remove(CLOCK).expect("clock type is stable");

    assert_eq!(
        context.provide(WRONG_CLOCK, "wrong".to_owned()),
        Err(LifecycleError::ServiceTypeMismatch(CLOCK.id()))
    );
    assert_eq!(context.state(&plugin), Some(FiberState::Pending));
    assert_eq!(activations.get(), 1);
}

#[test]
fn undeclared_service_access_fails_activation_as_a_typed_value() {
    let plugin = PluginId::new("consumer");
    let mut context = Context::new();
    context.provide(CLOCK, 1).expect("clock type is stable");

    let report = context
        .install(plugin.clone(), [], |ctx| {
            let _ = ctx.service(CLOCK)?;
            Ok(())
        })
        .expect("plugin id is unique");

    assert_eq!(report.activations.len(), 1);
    assert_eq!(context.state(&plugin), Some(FiberState::Failed));
    assert_eq!(
        context.failure(&plugin).map(PluginError::message),
        Some("service example.clock was not declared by this plugin")
    );
}
