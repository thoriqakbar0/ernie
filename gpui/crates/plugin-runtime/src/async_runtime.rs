use std::any::{Any, TypeId};
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::fmt;
use std::future::Future;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::pin::Pin;
use std::rc::Rc;
use std::task::{Context as TaskContext, Poll, Waker};

use futures::channel::{mpsc, oneshot};
use futures::future::{FutureExt, LocalBoxFuture};
use futures::stream::Stream;

use crate::types::ServiceType;
use crate::{
    CleanupError, CleanupFailure, FiberState, LifecycleError, LifecycleReport, PluginError,
    PluginFailure, PluginId, ServiceId, ServiceKey, ServiceRef,
};

type AsyncCleanup =
    Box<dyn FnOnce() -> LocalBoxFuture<'static, Result<(), CleanupError>> + 'static>;
type AsyncPlugin = Box<
    dyn FnMut(AsyncPluginContext) -> LocalBoxFuture<'static, Result<(), PluginError>> + 'static,
>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ProviderGeneration(u64);

struct StoredService {
    generation: ProviderGeneration,
    value: Rc<dyn Any>,
}

struct ServiceSlot {
    service_type: ServiceType,
    current: Option<StoredService>,
}

#[derive(Clone)]
struct SnapshotService {
    service_type: TypeId,
    value: Rc<dyn Any>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct DependencyStamp(Vec<(ServiceId, ProviderGeneration)>);

struct ArmedAsyncCleanup {
    sequence: usize,
    cleanup: AsyncCleanup,
}

#[derive(Default)]
struct AsyncEffectScope {
    cleanups: Vec<ArmedAsyncCleanup>,
}

impl AsyncEffectScope {
    fn acquire<Value>(&mut self, value: Value, cleanup: AsyncCleanup) -> Value {
        let sequence = self.cleanups.len() + 1;
        self.cleanups.push(ArmedAsyncCleanup { sequence, cleanup });
        value
    }

    fn drain(mut self, plugin: PluginId) -> LocalBoxFuture<'static, Vec<CleanupFailure>> {
        async move {
            let mut failures = Vec::new();
            while let Some(armed) = self.cleanups.pop() {
                let cleanup = catch_unwind(AssertUnwindSafe(armed.cleanup));
                let error = match cleanup {
                    Ok(cleanup) => match AssertUnwindSafe(cleanup).catch_unwind().await {
                        Ok(Ok(())) => continue,
                        Ok(Err(error)) => error,
                        Err(_) => CleanupError::panicked(),
                    },
                    Err(_) => CleanupError::panicked(),
                };
                failures.push(CleanupFailure {
                    plugin: plugin.clone(),
                    sequence: armed.sequence,
                    error,
                });
            }
            failures
        }
        .boxed_local()
    }
}

#[derive(Clone, Default)]
struct CancellationState {
    revoked: Rc<Cell<bool>>,
    wakers: Rc<RefCell<Vec<Waker>>>,
}

/// A local cancellation signal for one activation attempt.
///
/// Awaiting a clone completes when the driver revokes the owning ticket.
#[derive(Clone, Default)]
pub struct Cancellation {
    state: CancellationState,
}

impl Cancellation {
    /// Returns whether the owning activation ticket has been revoked.
    pub fn is_cancelled(&self) -> bool {
        self.state.revoked.get()
    }

    fn revoke(&self) {
        if self.state.revoked.replace(true) {
            return;
        }
        for waker in self.state.wakers.borrow_mut().drain(..) {
            waker.wake();
        }
    }
}

impl Future for Cancellation {
    type Output = ();

    fn poll(self: Pin<&mut Self>, context: &mut TaskContext<'_>) -> Poll<Self::Output> {
        if self.is_cancelled() {
            return Poll::Ready(());
        }
        let mut wakers = self.state.wakers.borrow_mut();
        if !wakers.iter().any(|waker| waker.will_wake(context.waker())) {
            wakers.push(context.waker().clone());
        }
        drop(wakers);
        if self.is_cancelled() {
            Poll::Ready(())
        } else {
            Poll::Pending
        }
    }
}

#[derive(Clone)]
struct ActivationAttempt(Rc<()>);

impl ActivationAttempt {
    fn new() -> Self {
        Self(Rc::new(()))
    }

    fn is_same(&self, other: &Self) -> bool {
        Rc::ptr_eq(&self.0, &other.0)
    }
}

#[derive(Clone)]
struct ActivationTicket {
    plugin: PluginId,
    attempt: ActivationAttempt,
    stamp: DependencyStamp,
    cancellation: Cancellation,
}

impl ActivationTicket {
    fn is_same(&self, other: &Self) -> bool {
        self.plugin == other.plugin
            && self.attempt.is_same(&other.attempt)
            && self.stamp == other.stamp
    }

    fn revoke(&self) {
        self.cancellation.revoke();
    }

    fn is_revoked(&self) -> bool {
        self.cancellation.is_cancelled()
    }
}

struct ActivationDraft {
    effects: AsyncEffectScope,
}

struct ActivationCompletion {
    ticket: ActivationTicket,
    result: Result<(), PluginError>,
    draft: ActivationDraft,
}

struct LoadingActivation {
    ticket: ActivationTicket,
    future: LocalBoxFuture<'static, ActivationCompletion>,
}

struct AsyncActivation {
    stamp: DependencyStamp,
    effects: AsyncEffectScope,
}

struct AsyncFailedActivation {
    stamp: DependencyStamp,
    error: PluginError,
}

enum AfterDrain {
    Reconcile,
    Fail {
        stamp: DependencyStamp,
        error: PluginError,
    },
}

struct DrainingActivation {
    future: LocalBoxFuture<'static, Vec<CleanupFailure>>,
    after: AfterDrain,
}

enum AsyncFiberLifecycle {
    Pending,
    Loading(LoadingActivation),
    Active(AsyncActivation),
    Draining(DrainingActivation),
    Failed(AsyncFailedActivation),
}

struct AsyncFiber {
    id: PluginId,
    requires: Vec<ServiceId>,
    plugin: AsyncPlugin,
    lifecycle: AsyncFiberLifecycle,
}

/// Capabilities available during one local async activation attempt.
pub struct AsyncPluginContext {
    services: HashMap<ServiceId, SnapshotService>,
    requires: Vec<ServiceId>,
    effects: Rc<RefCell<AsyncEffectScope>>,
    cancellation: Cancellation,
}

impl AsyncPluginContext {
    /// Reads one declared service from the activation's fixed provider generation.
    pub fn service<Value: 'static>(
        &self,
        key: ServiceKey<Value>,
    ) -> Result<ServiceRef<Value>, PluginError> {
        let id = key.id();
        if self.requires.binary_search(&id).is_err() {
            return Err(PluginError::undeclared_service(id));
        }
        let service = self
            .services
            .get(&id)
            .ok_or_else(|| PluginError::missing_service(id))?;
        if service.service_type != TypeId::of::<Value>() {
            return Err(PluginError::service_type_mismatch(id));
        }
        let value = Rc::clone(&service.value)
            .downcast::<Value>()
            .map_err(|_| PluginError::service_type_mismatch(id))?;
        Ok(ServiceRef::from_rc(value))
    }

    /// Associates an acquired value with exactly-once async cleanup for this attempt.
    pub fn acquire<Value, CleanupFuture>(
        &self,
        value: Value,
        cleanup: impl FnOnce() -> CleanupFuture + 'static,
    ) -> Value
    where
        CleanupFuture: Future<Output = Result<(), CleanupError>> + 'static,
    {
        self.effects
            .borrow_mut()
            .acquire(value, Box::new(move || cleanup().boxed_local()))
    }

    /// Returns the cancellation signal tied to this activation ticket.
    pub fn cancellation(&self) -> Cancellation {
        self.cancellation.clone()
    }
}

enum Command {
    Install {
        id: PluginId,
        requires: Vec<ServiceId>,
        plugin: AsyncPlugin,
        response: oneshot::Sender<Result<(), LifecycleError>>,
    },
    Provide {
        id: ServiceId,
        service_type: TypeId,
        value: Rc<dyn Any>,
        response: oneshot::Sender<Result<(), LifecycleError>>,
    },
    Remove {
        id: ServiceId,
        service_type: TypeId,
        response: oneshot::Sender<Result<(), LifecycleError>>,
    },
    State {
        id: PluginId,
        response: oneshot::Sender<Option<FiberState>>,
    },
    Failure {
        id: PluginId,
        response: oneshot::Sender<Option<PluginError>>,
    },
}

/// A cloneable command handle for the local async plugin driver.
///
/// Mutations finish after the driver accepts the registry change. Query the
/// plugin state separately when activation completion matters.
#[derive(Clone)]
pub struct AsyncContext {
    commands: mpsc::UnboundedSender<Command>,
}

/// A rejected async runtime command.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AsyncLifecycleError {
    /// The lifecycle boundary rejected the requested mutation.
    Lifecycle(LifecycleError),
    /// The owning local driver no longer accepts commands.
    DriverStopped,
}

impl fmt::Display for AsyncLifecycleError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Lifecycle(error) => error.fmt(formatter),
            Self::DriverStopped => formatter.write_str("local plugin driver has stopped"),
        }
    }
}

impl std::error::Error for AsyncLifecycleError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Lifecycle(error) => Some(error),
            Self::DriverStopped => None,
        }
    }
}

impl AsyncContext {
    /// Installs a local async plugin and schedules activation when its requirements exist.
    pub async fn install<Activate, ActivationFuture>(
        &self,
        id: PluginId,
        requires: impl IntoIterator<Item = ServiceId>,
        mut activate: Activate,
    ) -> Result<(), AsyncLifecycleError>
    where
        Activate: FnMut(AsyncPluginContext) -> ActivationFuture + 'static,
        ActivationFuture: Future<Output = Result<(), PluginError>> + 'static,
    {
        let mut requires = requires.into_iter().collect::<Vec<_>>();
        requires.sort_unstable();
        requires.dedup();
        let plugin = Box::new(move |context| activate(context).boxed_local());
        let (response, result) = oneshot::channel();
        self.commands
            .unbounded_send(Command::Install {
                id,
                requires,
                plugin,
                response,
            })
            .map_err(|_| AsyncLifecycleError::DriverStopped)?;
        result
            .await
            .map_err(|_| AsyncLifecycleError::DriverStopped)?
            .map_err(AsyncLifecycleError::Lifecycle)
    }

    /// Registers or replaces one typed external provider.
    pub async fn provide<Value: 'static>(
        &self,
        key: ServiceKey<Value>,
        value: Value,
    ) -> Result<(), AsyncLifecycleError> {
        let (response, result) = oneshot::channel();
        self.commands
            .unbounded_send(Command::Provide {
                id: key.id(),
                service_type: TypeId::of::<Value>(),
                value: Rc::new(value),
                response,
            })
            .map_err(|_| AsyncLifecycleError::DriverStopped)?;
        result
            .await
            .map_err(|_| AsyncLifecycleError::DriverStopped)?
            .map_err(AsyncLifecycleError::Lifecycle)
    }

    /// Removes one typed external provider when it exists.
    pub async fn remove<Value: 'static>(
        &self,
        key: ServiceKey<Value>,
    ) -> Result<(), AsyncLifecycleError> {
        let (response, result) = oneshot::channel();
        self.commands
            .unbounded_send(Command::Remove {
                id: key.id(),
                service_type: TypeId::of::<Value>(),
                response,
            })
            .map_err(|_| AsyncLifecycleError::DriverStopped)?;
        result
            .await
            .map_err(|_| AsyncLifecycleError::DriverStopped)?
            .map_err(AsyncLifecycleError::Lifecycle)
    }

    /// Returns one installed plugin's stable observable state.
    pub async fn state(&self, id: &PluginId) -> Result<Option<FiberState>, AsyncLifecycleError> {
        let (response, result) = oneshot::channel();
        self.commands
            .unbounded_send(Command::State {
                id: id.clone(),
                response,
            })
            .map_err(|_| AsyncLifecycleError::DriverStopped)?;
        result.await.map_err(|_| AsyncLifecycleError::DriverStopped)
    }

    /// Returns the activation failure stored for the current dependency generation.
    pub async fn failure(&self, id: &PluginId) -> Result<Option<PluginError>, AsyncLifecycleError> {
        let (response, result) = oneshot::channel();
        self.commands
            .unbounded_send(Command::Failure {
                id: id.clone(),
                response,
            })
            .map_err(|_| AsyncLifecycleError::DriverStopped)?;
        result.await.map_err(|_| AsyncLifecycleError::DriverStopped)
    }
}

/// Creates a local command handle and its executor-neutral driver future.
///
/// Poll the driver while awaiting commands. Dropping every handle starts
/// orderly shutdown.
pub fn local_runtime() -> (AsyncContext, LocalDriver) {
    let (commands, receiver) = mpsc::unbounded();
    (
        AsyncContext { commands },
        LocalDriver {
            receiver,
            services: HashMap::new(),
            fibers: Vec::new(),
            next_generation: 0,
            report: LifecycleReport::default(),
            shutting_down: false,
        },
    )
}

/// The single writer for one local async plugin runtime.
///
/// Completion returns cleanup and activation failures from the driver's life.
pub struct LocalDriver {
    receiver: mpsc::UnboundedReceiver<Command>,
    services: HashMap<ServiceId, ServiceSlot>,
    fibers: Vec<AsyncFiber>,
    next_generation: u64,
    report: LifecycleReport,
    shutting_down: bool,
}

impl LocalDriver {
    fn dependency_stamp(&self, index: usize) -> Option<DependencyStamp> {
        self.fibers[index]
            .requires
            .iter()
            .map(|id| {
                let provider = self.services.get(id)?.current.as_ref()?;
                Some((*id, provider.generation))
            })
            .collect::<Option<Vec<_>>>()
            .map(DependencyStamp)
    }

    fn service_snapshot(&self, index: usize) -> HashMap<ServiceId, SnapshotService> {
        self.fibers[index]
            .requires
            .iter()
            .filter_map(|id| {
                let slot = self.services.get(id)?;
                let current = slot.current.as_ref()?;
                Some((
                    *id,
                    SnapshotService {
                        service_type: slot.service_type.id,
                        value: Rc::clone(&current.value),
                    },
                ))
            })
            .collect()
    }

    fn reconcile_all(&mut self) {
        for index in 0..self.fibers.len() {
            self.reconcile_fiber(index);
        }
    }

    fn reconcile_fiber(&mut self, index: usize) {
        let desired = self.dependency_stamp(index);
        enum Transition {
            None,
            Start(DependencyStamp),
            Revoke,
            Drain,
            Reset(Option<DependencyStamp>),
        }
        let transition = match (&self.fibers[index].lifecycle, &desired) {
            (AsyncFiberLifecycle::Pending, Some(stamp)) if !self.shutting_down => {
                Transition::Start(stamp.clone())
            }
            (AsyncFiberLifecycle::Loading(loading), stamp)
                if Some(&loading.ticket.stamp) != stamp.as_ref() || self.shutting_down =>
            {
                Transition::Revoke
            }
            (AsyncFiberLifecycle::Active(active), stamp)
                if Some(&active.stamp) != stamp.as_ref() || self.shutting_down =>
            {
                Transition::Drain
            }
            (AsyncFiberLifecycle::Failed(failed), stamp)
                if Some(&failed.stamp) != stamp.as_ref() =>
            {
                Transition::Reset(stamp.clone())
            }
            _ => Transition::None,
        };

        match transition {
            Transition::None => {}
            Transition::Start(stamp) => self.start_activation(index, stamp),
            Transition::Revoke => {
                if let AsyncFiberLifecycle::Loading(loading) = &self.fibers[index].lifecycle {
                    loading.ticket.revoke();
                }
            }
            Transition::Drain => {
                let previous = std::mem::replace(
                    &mut self.fibers[index].lifecycle,
                    AsyncFiberLifecycle::Pending,
                );
                if let AsyncFiberLifecycle::Active(active) = previous {
                    self.begin_drain(index, active.effects, AfterDrain::Reconcile);
                }
            }
            Transition::Reset(stamp) => {
                self.fibers[index].lifecycle = AsyncFiberLifecycle::Pending;
                if let Some(stamp) = stamp.filter(|_| !self.shutting_down) {
                    self.start_activation(index, stamp);
                }
            }
        }
    }

    fn start_activation(&mut self, index: usize, stamp: DependencyStamp) {
        let cancellation = Cancellation::default();
        let ticket = ActivationTicket {
            plugin: self.fibers[index].id.clone(),
            attempt: ActivationAttempt::new(),
            stamp,
            cancellation: cancellation.clone(),
        };
        let effects = Rc::new(RefCell::new(AsyncEffectScope::default()));
        let context = AsyncPluginContext {
            services: self.service_snapshot(index),
            requires: self.fibers[index].requires.clone(),
            effects: Rc::clone(&effects),
            cancellation,
        };
        let activation = {
            let plugin = &mut self.fibers[index].plugin;
            catch_unwind(AssertUnwindSafe(|| plugin(context)))
        };
        let completion_ticket = ticket.clone();
        let future = async move {
            let result = match activation {
                Ok(activation) => match AssertUnwindSafe(activation).catch_unwind().await {
                    Ok(result) => result,
                    Err(_) => Err(PluginError::panicked()),
                },
                Err(_) => Err(PluginError::panicked()),
            };
            let effects = std::mem::take(&mut *effects.borrow_mut());
            ActivationCompletion {
                ticket: completion_ticket,
                result,
                draft: ActivationDraft { effects },
            }
        }
        .boxed_local();
        self.fibers[index].lifecycle =
            AsyncFiberLifecycle::Loading(LoadingActivation { ticket, future });
    }

    fn begin_drain(&mut self, index: usize, effects: AsyncEffectScope, after: AfterDrain) {
        let future = effects.drain(self.fibers[index].id.clone());
        self.fibers[index].lifecycle =
            AsyncFiberLifecycle::Draining(DrainingActivation { future, after });
    }

    fn complete_activation(&mut self, index: usize, completion: ActivationCompletion) {
        let previous = std::mem::replace(
            &mut self.fibers[index].lifecycle,
            AsyncFiberLifecycle::Pending,
        );
        let AsyncFiberLifecycle::Loading(loading) = previous else {
            self.begin_drain(index, completion.draft.effects, AfterDrain::Reconcile);
            return;
        };
        let current = self.dependency_stamp(index);
        let can_commit = loading.ticket.is_same(&completion.ticket)
            && current.as_ref() == Some(&completion.ticket.stamp)
            && !completion.ticket.is_revoked()
            && !self.shutting_down;

        match completion.result {
            Ok(()) if can_commit => {
                self.fibers[index].lifecycle = AsyncFiberLifecycle::Active(AsyncActivation {
                    stamp: completion.ticket.stamp,
                    effects: completion.draft.effects,
                });
            }
            Err(error) if can_commit => {
                self.begin_drain(
                    index,
                    completion.draft.effects,
                    AfterDrain::Fail {
                        stamp: completion.ticket.stamp,
                        error,
                    },
                );
            }
            _ => self.begin_drain(index, completion.draft.effects, AfterDrain::Reconcile),
        }
    }

    fn complete_drain(&mut self, index: usize, failures: Vec<CleanupFailure>, after: AfterDrain) {
        self.report.cleanups.extend(failures);
        self.fibers[index].lifecycle = AsyncFiberLifecycle::Pending;
        if let AfterDrain::Fail { stamp, error } = after {
            if self.dependency_stamp(index).as_ref() == Some(&stamp) && !self.shutting_down {
                self.report.activations.push(PluginFailure {
                    plugin: self.fibers[index].id.clone(),
                    error: error.clone(),
                });
                self.fibers[index].lifecycle =
                    AsyncFiberLifecycle::Failed(AsyncFailedActivation { stamp, error });
                return;
            }
        }
        self.reconcile_fiber(index);
    }

    fn poll_transitions(&mut self, context: &mut TaskContext<'_>) -> bool {
        for index in 0..self.fibers.len() {
            let ready = match &mut self.fibers[index].lifecycle {
                AsyncFiberLifecycle::Loading(loading) => loading
                    .future
                    .as_mut()
                    .poll(context)
                    .map(EitherReady::Activation),
                AsyncFiberLifecycle::Draining(draining) => draining
                    .future
                    .as_mut()
                    .poll(context)
                    .map(EitherReady::Drain),
                AsyncFiberLifecycle::Pending
                | AsyncFiberLifecycle::Active(_)
                | AsyncFiberLifecycle::Failed(_) => Poll::Pending,
            };
            let Poll::Ready(ready) = ready else {
                continue;
            };
            match ready {
                EitherReady::Activation(completion) => {
                    self.complete_activation(index, completion);
                }
                EitherReady::Drain(failures) => {
                    let previous = std::mem::replace(
                        &mut self.fibers[index].lifecycle,
                        AsyncFiberLifecycle::Pending,
                    );
                    let AsyncFiberLifecycle::Draining(draining) = previous else {
                        unreachable!("polled draining lifecycle changed before completion");
                    };
                    self.complete_drain(index, failures, draining.after);
                }
            }
            return true;
        }
        false
    }

    fn handle_command(&mut self, command: Command) {
        match command {
            Command::Install {
                id,
                requires,
                plugin,
                response,
            } => {
                if self.fibers.iter().any(|fiber| fiber.id == id) {
                    let _ = response.send(Err(LifecycleError::DuplicatePlugin(id)));
                    return;
                }
                self.fibers.push(AsyncFiber {
                    id,
                    requires,
                    plugin,
                    lifecycle: AsyncFiberLifecycle::Pending,
                });
                let index = self.fibers.len() - 1;
                self.reconcile_fiber(index);
                let _ = response.send(Ok(()));
            }
            Command::Provide {
                id,
                service_type,
                value,
                response,
            } => {
                if self
                    .services
                    .get(&id)
                    .is_some_and(|slot| slot.service_type.id != service_type)
                {
                    let _ = response.send(Err(LifecycleError::ServiceTypeMismatch(id)));
                    return;
                }
                let Some(next_generation) = self.next_generation.checked_add(1) else {
                    let _ = response.send(Err(LifecycleError::ProviderGenerationExhausted));
                    return;
                };
                self.next_generation = next_generation;
                let slot = self.services.entry(id).or_insert_with(|| ServiceSlot {
                    service_type: ServiceType { id: service_type },
                    current: None,
                });
                slot.current = Some(StoredService {
                    generation: ProviderGeneration(next_generation),
                    value,
                });
                self.reconcile_all();
                let _ = response.send(Ok(()));
            }
            Command::Remove {
                id,
                service_type,
                response,
            } => {
                let Some(slot) = self.services.get_mut(&id) else {
                    let _ = response.send(Ok(()));
                    return;
                };
                if slot.service_type.id != service_type {
                    let _ = response.send(Err(LifecycleError::ServiceTypeMismatch(id)));
                    return;
                }
                if slot.current.take().is_some() {
                    self.reconcile_all();
                }
                let _ = response.send(Ok(()));
            }
            Command::State { id, response } => {
                let state =
                    self.fibers
                        .iter()
                        .find(|fiber| fiber.id == id)
                        .map(|fiber| match fiber.lifecycle {
                            AsyncFiberLifecycle::Active(_) => FiberState::Active,
                            AsyncFiberLifecycle::Failed(_) => FiberState::Failed,
                            AsyncFiberLifecycle::Pending
                            | AsyncFiberLifecycle::Loading(_)
                            | AsyncFiberLifecycle::Draining(_) => FiberState::Pending,
                        });
                let _ = response.send(state);
            }
            Command::Failure { id, response } => {
                let failure = self
                    .fibers
                    .iter()
                    .find(|fiber| fiber.id == id)
                    .and_then(|fiber| match &fiber.lifecycle {
                        AsyncFiberLifecycle::Failed(failure) => Some(failure.error.clone()),
                        AsyncFiberLifecycle::Pending
                        | AsyncFiberLifecycle::Loading(_)
                        | AsyncFiberLifecycle::Active(_)
                        | AsyncFiberLifecycle::Draining(_) => None,
                    });
                let _ = response.send(failure);
            }
        }
    }

    fn begin_shutdown(&mut self) {
        self.shutting_down = true;
        self.reconcile_all();
    }

    fn shutdown_complete(&self) -> bool {
        self.fibers.iter().all(|fiber| {
            matches!(
                fiber.lifecycle,
                AsyncFiberLifecycle::Pending | AsyncFiberLifecycle::Failed(_)
            )
        })
    }
}

enum EitherReady {
    Activation(ActivationCompletion),
    Drain(Vec<CleanupFailure>),
}

impl Future for LocalDriver {
    type Output = LifecycleReport;

    fn poll(mut self: Pin<&mut Self>, context: &mut TaskContext<'_>) -> Poll<Self::Output> {
        loop {
            if self.poll_transitions(context) {
                continue;
            }
            if self.shutting_down {
                if self.shutdown_complete() {
                    return Poll::Ready(std::mem::take(&mut self.report));
                }
                return Poll::Pending;
            }
            match Pin::new(&mut self.receiver).poll_next(context) {
                Poll::Ready(Some(command)) => self.handle_command(command),
                Poll::Ready(None) => self.begin_shutdown(),
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}
