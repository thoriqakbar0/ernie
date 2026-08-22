//! Ernie's synchronous runtime for reversible, dependency-driven plugins.
//!
//! The lifecycle semantics are inspired by Cordis. This crate excludes loaders,
//! configuration files, dynamic modules, hot replacement, and async execution.

mod runtime;
mod types;

pub use runtime::{Context, PluginContext, ServiceRef};
pub use types::{
    CleanupError, CleanupFailure, FiberState, LifecycleError, LifecycleReport, PluginError,
    PluginFailure, PluginId, ServiceId, ServiceKey,
};
