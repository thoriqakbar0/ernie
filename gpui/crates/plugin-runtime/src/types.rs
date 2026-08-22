use std::any::TypeId;
use std::fmt;
use std::marker::PhantomData;

/// A stable identifier for a service slot.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ServiceId(&'static str);

impl ServiceId {
    /// Creates an identifier from an application-defined stable name.
    pub const fn new(value: &'static str) -> Self {
        Self(value)
    }

    /// Returns the stable name used for dependency matching.
    pub const fn as_str(self) -> &'static str {
        self.0
    }
}

/// A typed handle for one service slot.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct ServiceKey<Value: 'static> {
    id: ServiceId,
    marker: PhantomData<fn() -> Value>,
}

impl<Value: 'static> ServiceKey<Value> {
    /// Creates a typed service key with a stable dependency identifier.
    pub const fn new(id: &'static str) -> Self {
        Self {
            id: ServiceId::new(id),
            marker: PhantomData,
        }
    }

    /// Returns the identifier used by plugin requirements.
    pub const fn id(&self) -> ServiceId {
        self.id
    }
}

/// The stable identity of one installed plugin.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct PluginId(String);

impl PluginId {
    /// Creates a plugin identifier.
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    /// Returns the identifier as text.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// The observable stable state of one installed plugin.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FiberState {
    /// At least one required service is unavailable.
    Pending,
    /// The plugin is active against one dependency generation.
    Active,
    /// Activation failed for the current dependency generation.
    Failed,
}

/// A plugin activation failure.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PluginError {
    message: String,
}

impl PluginError {
    /// Creates an application-defined activation failure.
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    /// Returns the safe failure message.
    pub fn message(&self) -> &str {
        &self.message
    }

    pub(crate) fn missing_service(service: ServiceId) -> Self {
        Self::new(format!("service {} is unavailable", service.as_str()))
    }

    pub(crate) fn service_type_mismatch(service: ServiceId) -> Self {
        Self::new(format!(
            "service {} has a different value type",
            service.as_str()
        ))
    }

    pub(crate) fn undeclared_service(service: ServiceId) -> Self {
        Self::new(format!(
            "service {} was not declared by this plugin",
            service.as_str()
        ))
    }

    pub(crate) fn panicked() -> Self {
        Self::new("plugin activation panicked")
    }
}

impl fmt::Display for PluginError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for PluginError {}

/// One cleanup failure reported while draining continued.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CleanupError {
    message: String,
}

impl CleanupError {
    /// Creates an application-defined cleanup failure.
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }

    /// Returns the safe failure message.
    pub fn message(&self) -> &str {
        &self.message
    }

    pub(crate) fn panicked() -> Self {
        Self::new("plugin cleanup panicked")
    }
}

impl fmt::Display for CleanupError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for CleanupError {}

/// A cleanup failure tied to its owning plugin and acquisition sequence.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CleanupFailure {
    /// The plugin whose activation owned the cleanup.
    pub plugin: PluginId,
    /// The one-based acquisition sequence of the failed effect.
    pub sequence: usize,
    /// The isolated cleanup failure.
    pub error: CleanupError,
}

/// An activation failure observed during one lifecycle operation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PluginFailure {
    /// The plugin that failed to activate.
    pub plugin: PluginId,
    /// The activation failure.
    pub error: PluginError,
}

/// All isolated failures observed while one operation reconciled the runtime.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct LifecycleReport {
    /// Cleanup failures in the order they were observed.
    pub cleanups: Vec<CleanupFailure>,
    /// Activation failures in installation order.
    pub activations: Vec<PluginFailure>,
}

impl LifecycleReport {
    pub(crate) fn append(&mut self, mut other: Self) {
        self.cleanups.append(&mut other.cleanups);
        self.activations.append(&mut other.activations);
    }
}

/// A boundary error that leaves lifecycle state unchanged.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LifecycleError {
    /// Another plugin already owns this identifier.
    DuplicatePlugin(PluginId),
    /// A stable service slot was used with a different Rust value type.
    ServiceTypeMismatch(ServiceId),
    /// The provider generation counter cannot advance.
    ProviderGenerationExhausted,
}

impl fmt::Display for LifecycleError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DuplicatePlugin(plugin) => {
                write!(formatter, "plugin {} is already installed", plugin.as_str())
            }
            Self::ServiceTypeMismatch(service) => write!(
                formatter,
                "service {} has a different value type",
                service.as_str()
            ),
            Self::ProviderGenerationExhausted => {
                formatter.write_str("provider generation counter is exhausted")
            }
        }
    }
}

impl std::error::Error for LifecycleError {}

pub(crate) struct ServiceType {
    pub(crate) id: TypeId,
}
