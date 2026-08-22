//! Native client for Prime Agent's local daemon protocol.

mod client;
mod discovery;
mod manifest;
mod protocol;

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

pub use client::DaemonClient;
pub use discovery::DaemonEndpointSource;
use serde::Serialize;
use serde_json::{Map, Value};
use thiserror::Error;

/// Prime Agent source revision used for the pinned protocol inventory.
pub const PRIME_AGENT_PROTOCOL_SOURCE: &str = manifest::SOURCE_COMMIT;
/// Pinned Prime Agent daemon protocol version.
pub const PRIME_AGENT_PROTOCOL_VERSION: u32 = manifest::PROTOCOL_VERSION;
/// Pinned Prime Agent daemon schema revision.
pub const PRIME_AGENT_SCHEMA_REVISION: u32 = manifest::SCHEMA_REVISION;

/// One validated Prime Agent daemon command body.
#[derive(Clone, Debug)]
pub struct DaemonCommand {
    name: String,
    fields: Map<String, Value>,
    mutating: bool,
}

impl DaemonCommand {
    /// Creates a command whose name exists in the pinned Prime Agent protocol.
    pub fn new(name: impl Into<String>) -> Result<Self, CommandBuildError> {
        let name = name.into();
        let Some(spec) = manifest::command(&name).filter(|_| name != "ack_result") else {
            return Err(CommandBuildError::UnknownCommand(name));
        };
        Ok(Self {
            name,
            fields: Map::new(),
            mutating: spec.mutating,
        })
    }

    /// Adds one serializable command field.
    pub fn with_field(
        mut self,
        name: impl Into<String>,
        value: impl Serialize,
    ) -> Result<Self, CommandBuildError> {
        let name = name.into();
        if matches!(name.as_str(), "type" | "id" | "protocol" | "clientId") {
            return Err(CommandBuildError::ReservedField(name));
        }
        let value = serde_json::to_value(value).map_err(CommandBuildError::Serialize)?;
        self.fields.insert(name, value);
        Ok(self)
    }

    pub(crate) fn into_parts(self) -> (String, Map<String, Value>) {
        (self.name, self.fields)
    }

    /// Reports whether Prime Agent journals this command as a mutation.
    pub fn is_mutating(&self) -> bool {
        self.mutating
    }
}

/// A correlated successful command response.
#[derive(Clone, Debug)]
pub struct CommandResponse {
    pub(crate) data: Option<Value>,
}

impl CommandResponse {
    /// Returns the command-specific response document when one exists.
    pub fn data(&self) -> Option<&Value> {
        self.data.as_ref()
    }

    /// Consumes the response and returns its command-specific document.
    pub fn into_data(self) -> Option<Value> {
        self.data
    }
}

/// One recognized asynchronous daemon record.
#[derive(Clone, Debug)]
pub struct DaemonEvent {
    pub(crate) message_type: String,
    pub(crate) payload: Value,
}

impl DaemonEvent {
    /// Returns the Prime Agent outbound record type.
    pub fn message_type(&self) -> &str {
        &self.message_type
    }

    /// Returns the complete record for domain-specific decoding.
    pub fn payload(&self) -> &Value {
        &self.payload
    }
}

/// Failure while constructing a daemon command.
#[derive(Debug, Error)]
pub enum CommandBuildError {
    /// The pinned protocol does not contain this command.
    #[error("unknown Prime Agent daemon command {0}")]
    UnknownCommand(String),
    /// The driver owns this envelope field.
    #[error("Prime Agent daemon command field {0} is reserved")]
    ReservedField(String),
    /// A command field could not be encoded as JSON.
    #[error("could not encode Prime Agent daemon command field: {0}")]
    Serialize(serde_json::Error),
}

#[cfg(test)]
mod command_tests {
    use super::{CommandBuildError, DaemonCommand};

    #[test]
    fn commands_are_checked_against_the_pinned_inventory() {
        let command = DaemonCommand::new("prompt").expect("prompt must be supported");

        assert!(command.is_mutating());
        assert!(matches!(
            DaemonCommand::new("future_command"),
            Err(CommandBuildError::UnknownCommand(name)) if name == "future_command"
        ));
        assert!(matches!(
            DaemonCommand::new("ack_result"),
            Err(CommandBuildError::UnknownCommand(name)) if name == "ack_result"
        ));
    }

    #[test]
    fn driver_owned_envelope_fields_cannot_be_overridden() {
        let result = DaemonCommand::new("list")
            .expect("list must be supported")
            .with_field("clientId", "spoofed");

        assert!(matches!(
            result,
            Err(CommandBuildError::ReservedField(name)) if name == "clientId"
        ));
    }
}

/// A validated local daemon endpoint.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaemonEndpoint(PathBuf);

impl DaemonEndpoint {
    /// Creates an endpoint from a non-empty local socket path.
    pub fn at(path: impl Into<PathBuf>) -> Result<Self, EndpointError> {
        let path = path.into();
        if path.as_os_str().is_empty() {
            return Err(EndpointError::Empty);
        }
        Ok(Self(path))
    }

    /// Discovers Ernie's configured or the current user's default daemon endpoint.
    pub fn discover() -> Result<(Self, DaemonEndpointSource), EndpointError> {
        discovery::discover()
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

/// Failure to construct a daemon endpoint.
#[derive(Debug, Error, Eq, PartialEq)]
pub enum EndpointError {
    /// The socket path was empty.
    #[error("the Prime Agent daemon socket path must not be empty")]
    Empty,
}

/// Facts accepted from the daemon greeting.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServerInfo {
    protocol_version: u32,
    schema_id: Option<String>,
    schema_revision: Option<u32>,
    app_version: Option<String>,
    capabilities: ServerCapabilities,
}

impl ServerInfo {
    /// Returns the accepted wire protocol version.
    pub fn protocol_version(&self) -> u32 {
        self.protocol_version
    }

    /// Returns the daemon's schema identity when published.
    pub fn schema_id(&self) -> Option<&str> {
        self.schema_id.as_deref()
    }

    /// Returns the daemon's schema revision when published.
    pub fn schema_revision(&self) -> Option<u32> {
        self.schema_revision
    }

    /// Returns the daemon application version when published.
    pub fn app_version(&self) -> Option<&str> {
        self.app_version.as_deref()
    }

    /// Reports whether the daemon published one known capability.
    pub fn supports(&self, capability: ServerCapability) -> bool {
        self.capabilities.known.contains(&capability)
    }

    /// Returns capability names unknown to this client.
    pub fn unknown_capabilities(&self) -> impl ExactSizeIterator<Item = &str> {
        self.capabilities.unknown.iter().map(String::as_str)
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct ServerCapabilities {
    known: BTreeSet<ServerCapability>,
    unknown: Vec<String>,
}

/// Optional daemon behavior understood by this client.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum ServerCapability {
    /// Attach replies include authoritative snapshots.
    AttachSnapshot,
    /// Session events include generation-aware sequence cursors.
    EventSequence,
    /// Attach snapshots can use begin, chunk, and end records.
    ChunkedSnapshot,
    /// The daemon exposes its model catalog.
    ModelCatalog,
}

/// A catalog returned by the daemon.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionList(Vec<SessionSummary>);

impl SessionList {
    /// Iterates over the returned sessions.
    pub fn iter(&self) -> impl ExactSizeIterator<Item = &SessionSummary> {
        self.0.iter()
    }

    /// Consumes the catalog and returns its sessions.
    pub fn into_vec(self) -> Vec<SessionSummary> {
        self.0
    }
}

/// A stable daemon session catalog entry.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionSummary {
    id: SessionId,
    active_id: Option<ActiveSessionId>,
    lifecycle: SessionLifecycle,
    activity: SessionActivity,
    name: Option<String>,
    working_directory: PathBuf,
    message_count: u64,
    attached_clients: u32,
    worker_state: Option<WorkerState>,
}

impl SessionSummary {
    /// Returns the durable session identifier.
    pub fn id(&self) -> &SessionId {
        &self.id
    }

    /// Returns the live daemon identity when the session is resident.
    pub fn active_id(&self) -> Option<&ActiveSessionId> {
        self.active_id.as_ref()
    }

    /// Returns the session lifecycle.
    pub fn lifecycle(&self) -> SessionLifecycle {
        self.lifecycle
    }

    /// Returns the current activity classification.
    pub fn activity(&self) -> SessionActivity {
        self.activity
    }

    /// Returns the session name when one exists.
    pub fn name(&self) -> Option<&str> {
        self.name.as_deref()
    }

    /// Returns the session working directory.
    pub fn working_directory(&self) -> &Path {
        &self.working_directory
    }

    /// Returns the persisted message count.
    pub fn message_count(&self) -> u64 {
        self.message_count
    }

    /// Returns the number of attached daemon clients.
    pub fn attached_clients(&self) -> u32 {
        self.attached_clients
    }

    /// Returns the resident worker state when published.
    pub fn worker_state(&self) -> Option<WorkerState> {
        self.worker_state
    }
}

/// Durable session identity.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct SessionId(String);

impl SessionId {
    /// Returns the identifier text.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Live daemon session identity.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct ActiveSessionId(String);

impl ActiveSessionId {
    /// Returns the identifier text.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Durable session lifecycle.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionLifecycle {
    /// No message has been sent yet.
    Draft,
    /// The session is visible and active or resumable.
    Live,
    /// The session was archived.
    Archived,
}

/// Current session activity.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionActivity {
    /// The session is doing work.
    Working,
    /// The session is currently idle.
    Idle,
}

/// Resident worker process state.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WorkerState {
    /// The worker is starting.
    Starting,
    /// The worker accepts commands.
    Ready,
    /// The worker is recovering.
    Recovering,
    /// The worker is stopping.
    Stopping,
    /// The worker failed recovery.
    Failed,
}

/// Failure while connecting and negotiating the daemon greeting.
#[derive(Debug, Error)]
pub enum ConnectError {
    /// The local socket could not connect.
    #[error("could not connect to the Prime Agent daemon: {0}")]
    Io(#[from] std::io::Error),
    /// The greeting did not arrive before the timeout.
    #[error("timed out waiting for the Prime Agent daemon greeting")]
    TimedOut,
    /// The driver thread could not start.
    #[error("the Prime Agent client driver could not start")]
    DriverStopped,
    /// The daemon greeting violated the protocol.
    #[error(transparent)]
    Protocol(#[from] ProtocolError),
}

/// Failure while executing one daemon request.
#[derive(Debug, Error)]
pub enum RequestError {
    /// The command could not be constructed.
    #[error(transparent)]
    Build(#[from] CommandBuildError),
    /// The driver connection closed before the request completed.
    #[error("the Prime Agent daemon connection closed")]
    ConnectionClosed,
    /// The daemon did not complete the command before its deadline.
    #[error("timed out waiting for the Prime Agent daemon response")]
    TimedOut,
    /// The daemon rejected the command.
    #[error("the Prime Agent daemon rejected {command}: {message}")]
    Remote {
        /// Command rejected by the daemon.
        command: String,
        /// Human-readable daemon failure.
        message: String,
        /// Structured daemon failure code when published.
        code: Option<String>,
    },
    /// The daemon response violated the protocol.
    #[error(transparent)]
    Protocol(#[from] ProtocolError),
}

/// A malformed or incompatible daemon message.
#[derive(Clone, Debug, Error, Eq, PartialEq)]
pub enum ProtocolError {
    /// A JSONL frame was not valid JSON.
    #[error("the daemon sent malformed JSON")]
    MalformedJson,
    /// A JSONL frame exceeded the client's memory bound.
    #[error("the daemon sent a frame larger than the supported limit")]
    FrameTooLarge,
    /// A JSONL frame was not valid UTF-8.
    #[error("the daemon sent a frame that was not valid UTF-8")]
    InvalidUtf8,
    /// The daemon sent an outbound record outside the pinned protocol inventory.
    #[error("the daemon sent unsupported outbound message {0}")]
    UnknownOutbound(String),
    /// The daemon sent a message before its greeting.
    #[error("the daemon sent {0} before daemon_hello")]
    MessageBeforeHello(String),
    /// The daemon sent more than one greeting.
    #[error("the daemon sent a duplicate daemon_hello")]
    DuplicateHello,
    /// The daemon published an incompatible protocol identity.
    #[error("unsupported daemon protocol {name} version {version}")]
    IncompatibleProtocol {
        /// Protocol name received from the daemon.
        name: String,
        /// Protocol version received from the daemon.
        version: u32,
    },
    /// A required field was missing or invalid.
    #[error("invalid {message_type} message: {field}")]
    InvalidField {
        /// Message being parsed.
        message_type: &'static str,
        /// Invalid field name.
        field: &'static str,
    },
    /// A response did not belong to an outstanding request.
    #[error("the daemon responded with unknown request id {0}")]
    UnknownResponseId(String),
    /// A response named a different command than the request.
    #[error("request {request_id} expected {expected}, received {actual}")]
    ResponseCommandMismatch {
        /// Correlation identifier.
        request_id: String,
        /// Expected command name.
        expected: String,
        /// Command name received from the daemon.
        actual: String,
    },
    /// A successful response contained invalid command data.
    #[error("the daemon returned invalid data for {0}")]
    InvalidResponseData(&'static str),
}
