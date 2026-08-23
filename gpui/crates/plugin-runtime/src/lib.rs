//! Ernie's local runtimes for reversible, dependency-driven plugins.
//!
//! The lifecycle semantics are inspired by Cordis. This crate excludes loaders,
//! configuration files, dynamic modules, and hot replacement.

mod async_runtime;
mod runtime;
mod types;

pub use async_runtime::{
    local_runtime, AsyncContext, AsyncLifecycleError, AsyncPluginContext, Cancellation, LocalDriver,
};
pub use runtime::{Context, PluginContext, ServiceRef};
pub use types::{
    CleanupError, CleanupFailure, FiberState, LifecycleError, LifecycleReport, PluginError,
    PluginFailure, PluginId, ServiceId, ServiceKey,
};
