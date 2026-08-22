//! Native client for Prime Agent's local daemon protocol.

mod attachment;
mod client;
mod discovery;
mod manifest;
mod protocol;

use std::path::{Path, PathBuf};

pub use attachment::{AttachedSession, Attachment, AttachmentState};
pub use client::DaemonClient;
pub use discovery::DaemonEndpointSource;
use thiserror::Error;

/// Prime Agent source revision used for the pinned protocol inventory.
pub const PRIME_AGENT_PROTOCOL_SOURCE: &str = manifest::SOURCE_COMMIT;
/// Pinned Prime Agent daemon protocol version.
pub const PRIME_AGENT_PROTOCOL_VERSION: u32 = manifest::PROTOCOL_VERSION;
/// Pinned Prime Agent daemon schema revision.
pub const PRIME_AGENT_SCHEMA_REVISION: u32 = manifest::SCHEMA_REVISION;

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

    pub(crate) fn supports_name(&self, capability: &str) -> bool {
        ServerCapability::parse(capability).is_some_and(|value| self.supports(value))
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct ServerCapabilities {
    known: std::collections::BTreeSet<ServerCapability>,
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
    /// The daemon accepts extension UI responses.
    ExtensionUi,
    /// Attach replies omit duplicate legacy snapshot fields.
    SlimAttach,
    /// The client can own worker lifetime and recovery.
    ClientOwnedSessions,
    /// The daemon can delete RLM subagents.
    DeleteRlmSubagent,
    /// The daemon publishes heartbeat catalogs.
    HeartbeatCatalog,
    /// The daemon accepts heartbeat management commands.
    HeartbeatManagement,
    /// Side questions accept previous turns.
    SideQuestionTranscript,
    /// Bash requests accept transient run identity.
    TransientBash,
    /// The daemon owns prompt admission.
    SessionInputAdmission,
    /// Prompt admission can be cancelled.
    PromptAdmissionCancellation,
    /// Owned prompt admission can be cancelled.
    OwnedPromptCancellation,
    /// Queued messages can be mutated.
    QueueMessageMutation,
    /// Child rosters are authoritative.
    AuthoritativeChildRoster,
    /// Owned-session recovery context can be supplied.
    OwnedSessionRecoveryContext,
    /// Headless completion can wait for RLM quiescence.
    RlmQuiescenceBarrier,
    /// Session input can be paused with a lease.
    SessionInputPause,
    /// Connection-scoped ACP MCP servers can be replaced.
    AcpMcpServers,
}

impl ServerCapability {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "attach_snapshot" => Self::AttachSnapshot,
            "event_sequence" => Self::EventSequence,
            "chunked_snapshot" => Self::ChunkedSnapshot,
            "model_catalog" => Self::ModelCatalog,
            "extension_ui" => Self::ExtensionUi,
            "slim_attach" => Self::SlimAttach,
            "client_owned_sessions" => Self::ClientOwnedSessions,
            "delete_rlm_subagent" => Self::DeleteRlmSubagent,
            "heartbeat_catalog" => Self::HeartbeatCatalog,
            "heartbeat_management" => Self::HeartbeatManagement,
            "side_question_transcript" => Self::SideQuestionTranscript,
            "transient_bash" => Self::TransientBash,
            "session_input_admission" => Self::SessionInputAdmission,
            "prompt_admission_cancellation" => Self::PromptAdmissionCancellation,
            "owned_prompt_cancellation" => Self::OwnedPromptCancellation,
            "queue_message_mutation" => Self::QueueMessageMutation,
            "authoritative_child_roster" => Self::AuthoritativeChildRoster,
            "owned_session_recovery_context" => Self::OwnedSessionRecoveryContext,
            "rlm_quiescence_barrier" => Self::RlmQuiescenceBarrier,
            "session_input_pause" => Self::SessionInputPause,
            "acp_mcp_servers" => Self::AcpMcpServers,
            _ => return None,
        })
    }
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
    /// Creates a live session identifier from non-empty daemon text.
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentifierError> {
        let value = value.into();
        if value.trim().is_empty() {
            return Err(IdentifierError::Empty);
        }
        Ok(Self(value))
    }

    /// Returns the identifier text.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Failure while constructing a daemon identifier.
#[derive(Clone, Debug, Error, Eq, PartialEq)]
pub enum IdentifierError {
    /// The identifier was empty.
    #[error("the Prime Agent daemon identifier must not be empty")]
    Empty,
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
    /// The driver connection closed before the request completed.
    #[error("the Prime Agent daemon connection closed")]
    ConnectionClosed,
    /// The daemon did not complete the command before its deadline.
    #[error("timed out waiting for the Prime Agent daemon response")]
    TimedOut,
    /// The connected daemon lacks a capability required by the command.
    #[error("Prime Agent command {command} requires capability {capability}")]
    CapabilityUnavailable {
        /// Command that could not run.
        command: &'static str,
        /// Missing capability name.
        capability: &'static str,
    },
    /// The connected daemon schema predates a required command field.
    #[error(
        "Prime Agent command {command} requires schema revision {required}, received {actual:?}"
    )]
    SchemaUnavailable {
        /// Command that could not run.
        command: &'static str,
        /// Minimum schema revision.
        required: u32,
        /// Daemon schema revision when published.
        actual: Option<u32>,
    },
    /// The daemon received a mutation but could not prove its result.
    #[error("the Prime Agent daemon could not prove the mutation result")]
    OutcomeUncertain,
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
    /// The client exhausted its monotonic command identifier space.
    #[error("the Prime Agent client exhausted its command identifiers")]
    CommandIdExhausted,
    /// A private driver command could not be admitted.
    #[error("the Prime Agent client could not admit a command: {0}")]
    InternalCommand(String),
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
