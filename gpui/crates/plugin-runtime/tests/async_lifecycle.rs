use std::cell::{Cell, RefCell};
use std::rc::Rc;

use ernie_plugin_runtime::{
    local_runtime, AsyncContext, CleanupError, FiberState, PluginError, PluginId, ServiceKey,
};
use futures::channel::oneshot;
use futures::executor::LocalPool;
use futures::task::LocalSpawnExt;

const CLOCK: ServiceKey<u64> = ServiceKey::new("example.clock");

fn spawn_runtime() -> (LocalPool, AsyncContext) {
    let pool = LocalPool::new();
    let (context, driver) = local_runtime();
    pool.spawner()
        .spawn_local(async move {
            let _ = driver.await;
        })
        .expect("local driver can be spawned");
    (pool, context)
}

fn wait_for_state(
    pool: &mut LocalPool,
    context: &AsyncContext,
    plugin: &PluginId,
    expected: FiberState,
) {
    for _ in 0..16 {
        let state = pool
            .run_until(context.state(plugin))
            .expect("driver is running");
        if state == Some(expected) {
            return;
        }
    }
    panic!("plugin did not reach {expected:?}");
}

#[test]
fn local_runtime_accepts_non_send_activation_futures_and_services() {
    let (mut pool, context) = spawn_runtime();
    let plugin = PluginId::new("consumer");
    let observed = Rc::new(Cell::new(0));
    let activation_observed = Rc::clone(&observed);

    pool.run_until(context.install(plugin.clone(), [CLOCK.id()], move |ctx| {
        let observed = Rc::clone(&activation_observed);
        async move {
            observed.set(*ctx.service(CLOCK)?);
            Ok(())
        }
    }))
    .expect("plugin id is unique");
    pool.run_until(context.provide(CLOCK, 7))
        .expect("clock type is stable");

    wait_for_state(&mut pool, &context, &plugin, FiberState::Active);
    assert_eq!(observed.get(), 7);
}

#[test]
fn stale_success_rolls_back_its_private_draft_once_before_retry() {
    let (mut pool, context) = spawn_runtime();
    let plugin = PluginId::new("consumer");
    let attempts = Rc::new(Cell::new(0));
    let activation_attempts = Rc::clone(&attempts);
    let events = Rc::new(RefCell::new(Vec::new()));
    let activation_events = Rc::clone(&events);
    let (release, wait) = oneshot::channel();
    let wait = Rc::new(RefCell::new(Some(wait)));

    pool.run_until(context.install(plugin.clone(), [CLOCK.id()], move |ctx| {
        let attempt = activation_attempts.get() + 1;
        activation_attempts.set(attempt);
        let events = Rc::clone(&activation_events);
        let wait =
            (attempt == 1).then(|| wait.borrow_mut().take().expect("first attempt owns gate"));
        async move {
            let clock = ctx.service(CLOCK)?;
            if let Some(wait) = wait {
                let cleanup_events = Rc::clone(&events);
                ctx.acquire((), move || async move {
                    cleanup_events.borrow_mut().push("cleanup 1".to_owned());
                    Ok(())
                });
                wait.await.map_err(|_| PluginError::new("gate dropped"))?;
            }
            events.borrow_mut().push(format!("activate {}", *clock));
            Ok(())
        }
    }))
    .expect("plugin id is unique");
    pool.run_until(context.provide(CLOCK, 1))
        .expect("clock type is stable");
    pool.run_until(context.provide(CLOCK, 2))
        .expect("replacement is accepted");
    release.send(()).expect("first activation is waiting");

    wait_for_state(&mut pool, &context, &plugin, FiberState::Active);
    assert_eq!(attempts.get(), 2);
    assert_eq!(*events.borrow(), ["activate 1", "cleanup 1", "activate 2"]);
}

#[test]
fn stale_failure_cannot_replace_the_latest_activation_state() {
    let (mut pool, context) = spawn_runtime();
    let plugin = PluginId::new("consumer");
    let attempts = Rc::new(Cell::new(0));
    let activation_attempts = Rc::clone(&attempts);
    let observed = Rc::new(Cell::new(0));
    let activation_observed = Rc::clone(&observed);
    let (release, wait) = oneshot::channel();
    let wait = Rc::new(RefCell::new(Some(wait)));

    pool.run_until(context.install(plugin.clone(), [CLOCK.id()], move |ctx| {
        let attempt = activation_attempts.get() + 1;
        activation_attempts.set(attempt);
        let observed = Rc::clone(&activation_observed);
        let wait =
            (attempt == 1).then(|| wait.borrow_mut().take().expect("first attempt owns gate"));
        async move {
            let clock = ctx.service(CLOCK)?;
            if let Some(wait) = wait {
                wait.await.map_err(|_| PluginError::new("gate dropped"))?;
                return Err(PluginError::new("stale failure"));
            }
            observed.set(*clock);
            Ok(())
        }
    }))
    .expect("plugin id is unique");
    pool.run_until(context.provide(CLOCK, 1))
        .expect("clock type is stable");
    pool.run_until(context.provide(CLOCK, 2))
        .expect("replacement is accepted");
    release.send(()).expect("first activation is waiting");

    wait_for_state(&mut pool, &context, &plugin, FiberState::Active);
    assert_eq!(attempts.get(), 2);
    assert_eq!(observed.get(), 2);
    assert_eq!(
        pool.run_until(context.failure(&plugin))
            .expect("driver is running"),
        None
    );
}

#[test]
fn rapid_dependency_changes_retry_once_against_the_latest_stamp() {
    let (mut pool, context) = spawn_runtime();
    let plugin = PluginId::new("consumer");
    let attempts = Rc::new(Cell::new(0));
    let activation_attempts = Rc::clone(&attempts);
    let observed = Rc::new(Cell::new(0));
    let activation_observed = Rc::clone(&observed);
    let (release, wait) = oneshot::channel();
    let wait = Rc::new(RefCell::new(Some(wait)));

    pool.run_until(context.install(plugin.clone(), [CLOCK.id()], move |ctx| {
        let attempt = activation_attempts.get() + 1;
        activation_attempts.set(attempt);
        let observed = Rc::clone(&activation_observed);
        let wait =
            (attempt == 1).then(|| wait.borrow_mut().take().expect("first attempt owns gate"));
        async move {
            let clock = ctx.service(CLOCK)?;
            if let Some(wait) = wait {
                wait.await.map_err(|_| PluginError::new("gate dropped"))?;
            }
            observed.set(*clock);
            Ok(())
        }
    }))
    .expect("plugin id is unique");
    pool.run_until(context.provide(CLOCK, 1))
        .expect("clock type is stable");
    for value in 2..=4 {
        pool.run_until(context.provide(CLOCK, value))
            .expect("replacement is accepted");
    }
    release.send(()).expect("first activation is waiting");

    wait_for_state(&mut pool, &context, &plugin, FiberState::Active);
    assert_eq!(attempts.get(), 2);
    assert_eq!(observed.get(), 4);
}

#[test]
fn provider_removal_awaits_async_cleanup_and_returns_to_pending() {
    let (mut pool, context) = spawn_runtime();
    let plugin = PluginId::new("consumer");
    let events = Rc::new(RefCell::new(Vec::new()));
    let activation_events = Rc::clone(&events);

    pool.run_until(context.install(plugin.clone(), [CLOCK.id()], move |ctx| {
        let events = Rc::clone(&activation_events);
        async move {
            let clock = ctx.service(CLOCK)?;
            ctx.acquire((), move || async move {
                events.borrow_mut().push(format!("cleanup {}", *clock));
                Ok(())
            });
            Ok(())
        }
    }))
    .expect("plugin id is unique");
    pool.run_until(context.provide(CLOCK, 9))
        .expect("clock type is stable");
    wait_for_state(&mut pool, &context, &plugin, FiberState::Active);

    pool.run_until(context.remove(CLOCK))
        .expect("clock type is stable");
    wait_for_state(&mut pool, &context, &plugin, FiberState::Pending);

    assert_eq!(*events.borrow(), ["cleanup 9"]);
}

#[test]
fn revocation_wakes_cooperative_activation_cancellation() {
    let (mut pool, context) = spawn_runtime();
    let plugin = PluginId::new("consumer");
    let attempts = Rc::new(Cell::new(0));
    let activation_attempts = Rc::clone(&attempts);
    let observed = Rc::new(Cell::new(0));
    let activation_observed = Rc::clone(&observed);

    pool.run_until(context.install(plugin.clone(), [CLOCK.id()], move |ctx| {
        let attempt = activation_attempts.get() + 1;
        activation_attempts.set(attempt);
        let observed = Rc::clone(&activation_observed);
        async move {
            let clock = ctx.service(CLOCK)?;
            if attempt == 1 {
                ctx.cancellation().await;
            } else {
                observed.set(*clock);
            }
            Ok(())
        }
    }))
    .expect("plugin id is unique");
    pool.run_until(context.provide(CLOCK, 1))
        .expect("clock type is stable");
    pool.run_until(context.provide(CLOCK, 2))
        .expect("replacement is accepted");

    wait_for_state(&mut pool, &context, &plugin, FiberState::Active);
    assert_eq!(attempts.get(), 2);
    assert_eq!(observed.get(), 2);
}

#[test]
fn fresh_failure_is_stored_only_for_its_dependency_stamp() {
    let (mut pool, context) = spawn_runtime();
    let plugin = PluginId::new("broken");

    pool.run_until(context.install(plugin.clone(), [], |_| async {
        Err(PluginError::new("not ready"))
    }))
    .expect("plugin id is unique");

    wait_for_state(&mut pool, &context, &plugin, FiberState::Failed);
    assert_eq!(
        pool.run_until(context.failure(&plugin))
            .expect("driver is running")
            .as_ref()
            .map(PluginError::message),
        Some("not ready")
    );
}

#[test]
fn orderly_shutdown_drains_active_effects_and_reports_failures() {
    let mut pool = LocalPool::new();
    let (context, driver) = local_runtime();
    let (report_sender, report_receiver) = oneshot::channel();
    pool.spawner()
        .spawn_local(async move {
            let _ = report_sender.send(driver.await);
        })
        .expect("local driver can be spawned");
    let plugin = PluginId::new("consumer");

    pool.run_until(
        context.install(plugin.clone(), [CLOCK.id()], |ctx| async move {
            ctx.acquire((), || async { Err(CleanupError::new("shutdown failed")) });
            Ok(())
        }),
    )
    .expect("plugin id is unique");
    pool.run_until(context.provide(CLOCK, 1))
        .expect("clock type is stable");
    wait_for_state(&mut pool, &context, &plugin, FiberState::Active);

    drop(context);
    let report = pool
        .run_until(report_receiver)
        .expect("driver reports orderly shutdown");

    assert_eq!(report.cleanups.len(), 1);
    assert_eq!(report.cleanups[0].plugin, plugin);
    assert_eq!(report.cleanups[0].error.message(), "shutdown failed");
}
