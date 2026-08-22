use std::any::{Any, TypeId};
use std::collections::HashMap;
use std::ops::Deref;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::rc::Rc;

use crate::types::ServiceType;
use crate::{
    CleanupError, CleanupFailure, FiberState, LifecycleError, LifecycleReport, PluginError,
    PluginFailure, PluginId, ServiceId, ServiceKey,
};

type Cleanup = Box<dyn FnOnce() -> Result<(), CleanupError>>;
type Plugin = Box<dyn for<'a> FnMut(&mut PluginContext<'a>) -> Result<(), PluginError>>;

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

#[derive(Clone, Debug, Eq, PartialEq)]
struct DependencyStamp(Vec<(ServiceId, ProviderGeneration)>);

struct ArmedCleanup {
    sequence: usize,
    cleanup: Cleanup,
}

#[derive(Default)]
struct EffectScope {
    cleanups: Vec<ArmedCleanup>,
}

impl EffectScope {
    fn acquire<Value>(&mut self, value: Value, cleanup: Cleanup) -> Value {
        let sequence = self.cleanups.len() + 1;
        self.cleanups.push(ArmedCleanup { sequence, cleanup });
        value
    }

    fn drain(mut self, plugin: &PluginId) -> Vec<CleanupFailure> {
        let mut failures = Vec::new();
        while let Some(armed) = self.cleanups.pop() {
            let result = catch_unwind(AssertUnwindSafe(armed.cleanup));
            let error = match result {
                Ok(Ok(())) => continue,
                Ok(Err(error)) => error,
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
}

struct Activation {
    stamp: DependencyStamp,
    effects: EffectScope,
}

struct FailedActivation {
    stamp: DependencyStamp,
    error: PluginError,
}

enum FiberLifecycle {
    Pending,
    Active(Activation),
    Failed(FailedActivation),
}

struct Fiber {
    id: PluginId,
    requires: Vec<ServiceId>,
    plugin: Plugin,
    lifecycle: FiberLifecycle,
}

/// A reference-counted service value fixed to one provider generation.
pub struct ServiceRef<Value: 'static>(Rc<Value>);

impl<Value: 'static> Clone for ServiceRef<Value> {
    fn clone(&self) -> Self {
        Self(Rc::clone(&self.0))
    }
}

impl<Value: 'static> Deref for ServiceRef<Value> {
    type Target = Value;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// Capabilities available during one plugin activation attempt.
pub struct PluginContext<'a> {
    services: &'a HashMap<ServiceId, ServiceSlot>,
    requires: &'a [ServiceId],
    effects: &'a mut EffectScope,
}

impl PluginContext<'_> {
    /// Reads one declared service from the activation's provider generation.
    pub fn service<Value: 'static>(
        &self,
        key: ServiceKey<Value>,
    ) -> Result<ServiceRef<Value>, PluginError> {
        let id = key.id();
        if self.requires.binary_search(&id).is_err() {
            return Err(PluginError::undeclared_service(id));
        }
        let slot = self
            .services
            .get(&id)
            .ok_or_else(|| PluginError::missing_service(id))?;
        if slot.service_type.id != TypeId::of::<Value>() {
            return Err(PluginError::service_type_mismatch(id));
        }
        let value = slot
            .current
            .as_ref()
            .ok_or_else(|| PluginError::missing_service(id))?
            .value
            .clone()
            .downcast::<Value>()
            .map_err(|_| PluginError::service_type_mismatch(id))?;
        Ok(ServiceRef(value))
    }

    /// Associates an acquired value with exactly-once cleanup for this activation.
    pub fn acquire<Value>(
        &mut self,
        value: Value,
        cleanup: impl FnOnce() -> Result<(), CleanupError> + 'static,
    ) -> Value {
        self.effects.acquire(value, Box::new(cleanup))
    }
}

/// The service registry and sole owner of installed plugin lifecycles.
#[derive(Default)]
pub struct Context {
    services: HashMap<ServiceId, ServiceSlot>,
    fibers: Vec<Fiber>,
    next_generation: u64,
}

impl Context {
    /// Creates an empty lifecycle context.
    pub fn new() -> Self {
        Self::default()
    }

    /// Installs a plugin and activates it when every requirement is available.
    pub fn install(
        &mut self,
        id: PluginId,
        requires: impl IntoIterator<Item = ServiceId>,
        plugin: impl for<'a> FnMut(&mut PluginContext<'a>) -> Result<(), PluginError> + 'static,
    ) -> Result<LifecycleReport, LifecycleError> {
        if self.fibers.iter().any(|fiber| fiber.id == id) {
            return Err(LifecycleError::DuplicatePlugin(id));
        }
        let mut requires = requires.into_iter().collect::<Vec<_>>();
        requires.sort_unstable();
        requires.dedup();
        self.fibers.push(Fiber {
            id,
            requires,
            plugin: Box::new(plugin),
            lifecycle: FiberLifecycle::Pending,
        });
        Ok(self.reconcile())
    }

    /// Registers or replaces a typed provider, then reconciles affected plugins.
    pub fn provide<Value: 'static>(
        &mut self,
        key: ServiceKey<Value>,
        value: Value,
    ) -> Result<LifecycleReport, LifecycleError> {
        let id = key.id();
        self.ensure_service_type::<Value>(id)?;
        let next_generation = self
            .next_generation
            .checked_add(1)
            .ok_or(LifecycleError::ProviderGenerationExhausted)?;

        let mut report = self.deactivate_active_requiring(id);
        self.next_generation = next_generation;
        let slot = self.services.entry(id).or_insert_with(|| ServiceSlot {
            service_type: ServiceType {
                id: TypeId::of::<Value>(),
            },
            current: None,
        });
        slot.current = Some(StoredService {
            generation: ProviderGeneration(next_generation),
            value: Rc::new(value),
        });
        report.append(self.reconcile());
        Ok(report)
    }

    /// Removes a provider after unloading active dependents.
    pub fn remove<Value: 'static>(
        &mut self,
        key: ServiceKey<Value>,
    ) -> Result<LifecycleReport, LifecycleError> {
        let id = key.id();
        let Some(slot) = self.services.get(&id) else {
            return Ok(LifecycleReport::default());
        };
        if slot.service_type.id != TypeId::of::<Value>() {
            return Err(LifecycleError::ServiceTypeMismatch(id));
        }
        if slot.current.is_none() {
            return Ok(LifecycleReport::default());
        }

        let mut report = self.deactivate_active_requiring(id);
        self.services
            .get_mut(&id)
            .expect("service slot exists after type check")
            .current = None;
        report.append(self.reconcile());
        Ok(report)
    }

    /// Returns one installed plugin's stable observable state.
    pub fn state(&self, id: &PluginId) -> Option<FiberState> {
        self.fibers
            .iter()
            .find(|fiber| &fiber.id == id)
            .map(|fiber| match fiber.lifecycle {
                FiberLifecycle::Pending => FiberState::Pending,
                FiberLifecycle::Active(_) => FiberState::Active,
                FiberLifecycle::Failed(_) => FiberState::Failed,
            })
    }

    /// Returns the activation failure stored for the current dependency generation.
    pub fn failure(&self, id: &PluginId) -> Option<&PluginError> {
        self.fibers
            .iter()
            .find(|fiber| &fiber.id == id)
            .and_then(|fiber| match &fiber.lifecycle {
                FiberLifecycle::Failed(failure) => Some(&failure.error),
                FiberLifecycle::Pending | FiberLifecycle::Active(_) => None,
            })
    }

    fn ensure_service_type<Value: 'static>(&self, id: ServiceId) -> Result<(), LifecycleError> {
        if self
            .services
            .get(&id)
            .is_some_and(|slot| slot.service_type.id != TypeId::of::<Value>())
        {
            return Err(LifecycleError::ServiceTypeMismatch(id));
        }
        Ok(())
    }

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

    fn deactivate_active_requiring(&mut self, service: ServiceId) -> LifecycleReport {
        let indexes = self
            .fibers
            .iter()
            .enumerate()
            .filter_map(|(index, fiber)| {
                let active = matches!(fiber.lifecycle, FiberLifecycle::Active(_));
                (active && fiber.requires.binary_search(&service).is_ok()).then_some(index)
            })
            .collect::<Vec<_>>();
        let mut report = LifecycleReport::default();
        for index in indexes {
            report.append(self.deactivate(index));
        }
        report
    }

    fn reconcile(&mut self) -> LifecycleReport {
        let mut report = LifecycleReport::default();
        for index in 0..self.fibers.len() {
            let desired = self.dependency_stamp(index);
            let transition = match (&self.fibers[index].lifecycle, &desired) {
                (FiberLifecycle::Pending, Some(stamp)) => Some((false, Some(stamp.clone()))),
                (FiberLifecycle::Pending, None) => None,
                (FiberLifecycle::Active(active), stamp)
                    if Some(&active.stamp) != stamp.as_ref() =>
                {
                    Some((true, stamp.clone()))
                }
                (FiberLifecycle::Active(_), _) => None,
                (FiberLifecycle::Failed(failed), Some(stamp)) if &failed.stamp != stamp => {
                    Some((false, Some(stamp.clone())))
                }
                (FiberLifecycle::Failed(_), None) => Some((false, None)),
                (FiberLifecycle::Failed(_), Some(_)) => None,
            };

            let Some((deactivate, activate_with)) = transition else {
                continue;
            };
            if deactivate {
                report.append(self.deactivate(index));
            } else {
                self.fibers[index].lifecycle = FiberLifecycle::Pending;
            }
            if let Some(stamp) = activate_with {
                report.append(self.activate(index, stamp));
            }
        }
        report
    }

    fn activate(&mut self, index: usize, stamp: DependencyStamp) -> LifecycleReport {
        let mut effects = EffectScope::default();
        let result = {
            let services = &self.services;
            let fiber = &mut self.fibers[index];
            let mut context = PluginContext {
                services,
                requires: &fiber.requires,
                effects: &mut effects,
            };
            catch_unwind(AssertUnwindSafe(|| (fiber.plugin)(&mut context)))
        };

        let result = match result {
            Ok(result) => result,
            Err(_) => Err(PluginError::panicked()),
        };
        match result {
            Ok(()) => {
                self.fibers[index].lifecycle =
                    FiberLifecycle::Active(Activation { stamp, effects });
                LifecycleReport::default()
            }
            Err(error) => {
                let id = self.fibers[index].id.clone();
                let cleanups = effects.drain(&id);
                self.fibers[index].lifecycle = FiberLifecycle::Failed(FailedActivation {
                    stamp,
                    error: error.clone(),
                });
                LifecycleReport {
                    cleanups,
                    activations: vec![PluginFailure { plugin: id, error }],
                }
            }
        }
    }

    fn deactivate(&mut self, index: usize) -> LifecycleReport {
        let previous =
            std::mem::replace(&mut self.fibers[index].lifecycle, FiberLifecycle::Pending);
        let FiberLifecycle::Active(activation) = previous else {
            return LifecycleReport::default();
        };
        LifecycleReport {
            cleanups: activation.effects.drain(&self.fibers[index].id),
            activations: Vec::new(),
        }
    }
}
