use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{
    manifest, ActiveSessionId, ProtocolError, RequestError, ServerCapabilities, ServerCapability,
    ServerInfo, SessionActivity, SessionId, SessionLifecycle, SessionList, SessionSummary,
    WorkerState,
};

pub(crate) const PROTOCOL_NAME: &str = "prime-agent.daemon";
const MAX_SNAPSHOT_MESSAGES: usize = 100_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum MutationClass {
    ReadOnly,
    Mutating,
    Acknowledgement,
}

#[derive(Clone, Debug)]
pub(crate) struct Command {
    name: &'static str,
    fields: Map<String, Value>,
    mutation: MutationClass,
    requirements: Vec<manifest::Compatibility>,
}

impl Command {
    pub(crate) fn list() -> Self {
        Self::from_fields("list", Map::new())
    }

    pub(crate) fn attach(
        active_id: &ActiveSessionId,
        client_id: &str,
        resume: Option<&EventCursor>,
    ) -> Self {
        let mut fields = Map::from_iter([
            (
                "activeSessionId".to_owned(),
                Value::String(active_id.as_str().to_owned()),
            ),
            ("clientId".to_owned(), Value::String(client_id.to_owned())),
            (
                "capabilities".to_owned(),
                serde_json::json!([
                    "attach_snapshot",
                    "event_sequence",
                    "slim_attach",
                    "chunked_snapshot"
                ]),
            ),
        ]);
        if let Some(cursor) = resume {
            fields.insert(
                "resumeCursor".to_owned(),
                serde_json::json!({
                    "activeSessionId": active_id.as_str(),
                    "generation": cursor.generation,
                    "sequence": cursor.sequence,
                }),
            );
        }
        let mut command = Self::from_fields("attach", fields);
        command.requirements.extend([
            manifest::Compatibility {
                min_schema_revision: None,
                capability: Some("attach_snapshot"),
            },
            manifest::Compatibility {
                min_schema_revision: None,
                capability: Some("event_sequence"),
            },
        ]);
        command
    }

    pub(crate) fn acknowledgement(command_id: &str) -> Self {
        let fields =
            Map::from_iter([("commandId".to_owned(), Value::String(command_id.to_owned()))]);
        let mut command = Self::from_fields("ack_result", fields);
        command.mutation = MutationClass::Acknowledgement;
        command
    }

    fn from_fields(name: &'static str, fields: Map<String, Value>) -> Self {
        let spec = manifest::command(name).expect("private commands must exist in the manifest");
        let mutation = if spec.mutating {
            MutationClass::Mutating
        } else {
            MutationClass::ReadOnly
        };
        let mut requirements = conditional_requirements(name, &fields);
        requirements.push(manifest::compatibility(name));
        Self {
            name,
            fields,
            mutation,
            requirements,
        }
    }

    #[cfg(test)]
    pub(crate) fn checked(name: &'static str, fields: Map<String, Value>) -> Option<Self> {
        manifest::command(name)
            .filter(|_| name != "ack_result")
            .map(|_| Self::from_fields(name, fields))
    }

    pub(crate) fn deadline(&self) -> Option<Duration> {
        match manifest::deadline(self.name) {
            manifest::DeadlineClass::Immediate => Some(Duration::from_secs(3)),
            manifest::DeadlineClass::Short => Some(Duration::from_secs(10)),
            manifest::DeadlineClass::Interactive => Some(Duration::from_secs(30)),
            manifest::DeadlineClass::Completion => None,
        }
    }

    pub(crate) fn check_compatibility(&self, server: &ServerInfo) -> Result<(), RequestError> {
        check_requirements(self.name, &self.requirements, server)
    }
}

fn check_requirements(
    command: &'static str,
    requirements: &[manifest::Compatibility],
    server: &ServerInfo,
) -> Result<(), RequestError> {
    for requirement in requirements {
        if let Some(required) = requirement.min_schema_revision {
            if server
                .schema_revision()
                .is_none_or(|actual| actual < required)
            {
                return Err(RequestError::SchemaUnavailable {
                    command,
                    required,
                    actual: server.schema_revision(),
                });
            }
        }
        if let Some(capability) = requirement.capability {
            if !server.supports_name(capability) {
                return Err(RequestError::CapabilityUnavailable {
                    command,
                    capability,
                });
            }
        }
    }
    Ok(())
}

fn conditional_requirements(
    name: &str,
    fields: &Map<String, Value>,
) -> Vec<manifest::Compatibility> {
    let mut requirements = Vec::new();
    if matches!(name, "attach" | "reattach") && fields.contains_key("recoveryConfig") {
        requirements.push(manifest::Compatibility {
            min_schema_revision: Some(17),
            capability: Some("owned_session_recovery_context"),
        });
    }
    let carries_telemetry_policy = matches!(name, "attach" | "reattach")
        && fields.contains_key("telemetryDisabled")
        || name == "create"
            && fields
                .get("config")
                .and_then(Value::as_object)
                .is_some_and(|config| config.contains_key("telemetryDisabled"));
    if carries_telemetry_policy {
        requirements.push(manifest::Compatibility {
            min_schema_revision: Some(14),
            capability: None,
        });
    }
    if matches!(name, "prompt" | "prompt_and_wait") && fields.contains_key("admissionId") {
        requirements.push(manifest::Compatibility {
            min_schema_revision: Some(8),
            capability: Some("prompt_admission_cancellation"),
        });
    }
    if name == "wait_for_headless_completion"
        && fields.get("waitForRlmQuiescence") == Some(&Value::Bool(true))
    {
        requirements.push(manifest::Compatibility {
            min_schema_revision: Some(18),
            capability: Some("rlm_quiescence_barrier"),
        });
    }
    if name == "cancel_prompt_admission" && fields.get("cancelOwned") == Some(&Value::Bool(true)) {
        requirements.push(manifest::Compatibility {
            min_schema_revision: Some(20),
            capability: Some("owned_prompt_cancellation"),
        });
    }
    requirements
}

#[derive(Clone, Debug)]
pub(crate) struct FrozenCommand {
    pub(crate) id: String,
    pub(crate) name: &'static str,
    pub(crate) mutation: MutationClass,
    pub(crate) bytes: Arc<[u8]>,
    pub(crate) deadline: Option<Duration>,
    requirements: Vec<manifest::Compatibility>,
}

impl FrozenCommand {
    pub(crate) fn check_compatibility(&self, server: &ServerInfo) -> Result<(), RequestError> {
        check_requirements(self.name, &self.requirements, server)
    }
}

pub(crate) fn freeze_command(
    command: Command,
    client_id: &str,
    command_id: String,
) -> Result<FrozenCommand, ProtocolError> {
    let deadline = command.deadline();
    let requirements = command.requirements.clone();
    let mut fields = command.fields;
    fields.insert("type".to_owned(), Value::String(command.name.to_owned()));
    let envelope = WireCommandEnvelope {
        message_type: "command",
        id: &command_id,
        protocol: WireProtocol {
            name: PROTOCOL_NAME,
            version: manifest::PROTOCOL_VERSION,
        },
        client_id,
        command: fields,
    };
    let mut bytes = serde_json::to_vec(&envelope).map_err(|_| ProtocolError::MalformedJson)?;
    bytes.push(b'\n');
    Ok(FrozenCommand {
        id: command_id,
        name: command.name,
        mutation: command.mutation,
        bytes: bytes.into(),
        deadline,
        requirements,
    })
}

pub(crate) fn parse_hello(line: &str) -> Result<ServerInfo, ProtocolError> {
    let value: Value = serde_json::from_str(line).map_err(|_| ProtocolError::MalformedJson)?;
    if value.get("type").and_then(Value::as_str) != Some("daemon_hello") {
        return Err(ProtocolError::MessageBeforeHello(
            value
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_owned(),
        ));
    }
    let hello: WireHello =
        serde_json::from_value(value).map_err(|_| ProtocolError::InvalidField {
            message_type: "daemon_hello",
            field: "shape",
        })?;
    if hello.protocol.name != PROTOCOL_NAME || hello.protocol.version != manifest::PROTOCOL_VERSION
    {
        return Err(ProtocolError::IncompatibleProtocol {
            name: hello.protocol.name,
            version: hello.protocol.version,
        });
    }
    if hello.client_id.trim().is_empty() {
        return Err(ProtocolError::InvalidField {
            message_type: "daemon_hello",
            field: "clientId",
        });
    }
    let mut capabilities = ServerCapabilities::default();
    for capability in hello.server_capabilities {
        if let Some(capability) = ServerCapability::parse(&capability) {
            capabilities.known.insert(capability);
        } else {
            capabilities.unknown.push(capability);
        }
    }
    Ok(ServerInfo {
        protocol_version: hello.protocol.version,
        schema_id: hello.schema_id,
        schema_revision: hello.schema_revision,
        app_version: hello.app_version,
        capabilities,
    })
}

#[derive(Debug)]
pub(crate) enum Outbound {
    Response(WireResponse),
    SessionListProgress,
    SessionListItem,
    DaemonHello,
    DaemonClosing,
    HeartbeatsChanged,
    SessionEvent(AttachmentRecord),
    SideQuestionEvent,
    SessionStatus(AttachmentRecord),
    SessionReplaced(AttachmentRecord),
    SessionResynced(AttachmentRecord),
    SessionAttached(AttachmentRecord),
    SnapshotBegin(AttachmentRecord),
    SnapshotChunk(AttachmentRecord),
    SnapshotEnd(AttachmentRecord),
    SnapshotFailed(AttachmentRecord),
    SessionDetached(AttachmentRecord),
    SessionClosed(AttachmentRecord),
    ExtensionUiRequest,
    ExtensionError,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum WireOutbound {
    Response(WireResponse),
    SessionListProgress {
        command: String,
        loaded: u64,
        total: u64,
    },
    SessionListItem {
        command: String,
        session: Value,
    },
    DaemonHello(WireHello),
    DaemonClosing {
        reason: String,
    },
    HeartbeatsChanged,
    SessionEvent {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
        event: Value,
        meta: Option<WireEventMeta>,
    },
    SideQuestionEvent {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
        event: Value,
    },
    SessionStatus {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
        recap: Option<String>,
        meta: Option<WireEventMeta>,
    },
    SessionReplaced {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
        state: Value,
        messages: Vec<Value>,
        #[serde(rename = "snapshotFollows", default)]
        snapshot_follows: bool,
        meta: Option<WireEventMeta>,
    },
    SessionResynced {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
        snapshot: WireSnapshot,
        meta: Option<WireEventMeta>,
    },
    SessionAttached {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
        state: WireSessionSummary,
        messages: Vec<Value>,
        snapshot: Option<WireSnapshot>,
        replay: Option<WireReplay>,
        #[serde(rename = "lastEventSequence")]
        last_event_sequence: Option<u64>,
    },
    SessionSnapshotBegin {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
        #[serde(rename = "snapshotId")]
        snapshot_id: String,
        snapshot: WireSnapshotHeader,
        #[serde(rename = "messageCount")]
        message_count: usize,
        #[serde(rename = "targetChunkBytes")]
        target_chunk_bytes: usize,
        purpose: Option<String>,
    },
    SessionSnapshotChunk {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
        #[serde(rename = "snapshotId")]
        snapshot_id: String,
        index: usize,
        messages: Vec<Value>,
    },
    SessionSnapshotEnd {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
        #[serde(rename = "snapshotId")]
        snapshot_id: String,
        #[serde(rename = "chunkCount")]
        chunk_count: usize,
        #[serde(rename = "lastEventSequence")]
        last_event_sequence: u64,
        #[serde(rename = "lastEventCursor")]
        last_event_cursor: Option<EventCursor>,
    },
    SessionSnapshotFailed {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
        #[serde(rename = "snapshotId")]
        snapshot_id: String,
        error: String,
    },
    SessionDetached {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
    },
    SessionClosed {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
        reason: String,
        meta: Option<WireEventMeta>,
    },
    ExtensionUiRequest {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
        id: String,
        method: String,
        payload: Map<String, Value>,
    },
    ExtensionError {
        #[serde(rename = "activeSessionId")]
        active_session_id: String,
        #[serde(rename = "extensionPath")]
        extension_path: String,
        event: String,
        error: String,
    },
}

pub(crate) fn parse_outbound(line: &str) -> Result<Outbound, ProtocolError> {
    let value: Value = serde_json::from_str(line).map_err(|_| ProtocolError::MalformedJson)?;
    let message_type =
        value
            .get("type")
            .and_then(Value::as_str)
            .ok_or(ProtocolError::InvalidField {
                message_type: "daemon outbound",
                field: "type",
            })?;
    if !manifest::recognizes_outbound(message_type) {
        return Err(ProtocolError::UnknownOutbound(message_type.to_owned()));
    }
    let outbound: WireOutbound =
        serde_json::from_value(value).map_err(|_| ProtocolError::InvalidField {
            message_type: "daemon outbound",
            field: "shape",
        })?;
    Ok(match outbound {
        WireOutbound::Response(response) => Outbound::Response(response),
        WireOutbound::SessionListProgress {
            command,
            loaded,
            total,
        } => {
            let _ = (command, loaded, total);
            Outbound::SessionListProgress
        }
        WireOutbound::SessionListItem { command, session } => {
            let _ = (command, session);
            Outbound::SessionListItem
        }
        WireOutbound::DaemonHello(hello) => {
            let _ = hello;
            Outbound::DaemonHello
        }
        WireOutbound::DaemonClosing { reason } => {
            let _ = reason;
            Outbound::DaemonClosing
        }
        WireOutbound::HeartbeatsChanged => Outbound::HeartbeatsChanged,
        WireOutbound::SessionEvent {
            active_session_id,
            event,
            meta,
        } => Outbound::SessionEvent(AttachmentRecord::Event {
            active_session_id,
            event,
            cursor: meta.and_then(WireEventMeta::cursor),
        }),
        WireOutbound::SideQuestionEvent {
            active_session_id,
            event,
        } => {
            let _ = (active_session_id, event);
            Outbound::SideQuestionEvent
        }
        WireOutbound::SessionStatus {
            active_session_id,
            recap,
            meta,
        } => Outbound::SessionStatus(AttachmentRecord::Status {
            active_session_id,
            recap,
            cursor: meta.and_then(WireEventMeta::cursor),
        }),
        WireOutbound::SessionReplaced {
            active_session_id,
            state,
            messages,
            snapshot_follows,
            meta,
        } => Outbound::SessionReplaced(AttachmentRecord::Replaced {
            active_session_id,
            state,
            messages,
            snapshot_follows,
            cursor: meta.and_then(WireEventMeta::cursor),
        }),
        WireOutbound::SessionResynced {
            active_session_id,
            snapshot,
            meta,
        } => {
            let _ = meta;
            Outbound::SessionResynced(AttachmentRecord::Snapshot {
                active_session_id,
                snapshot,
            })
        }
        WireOutbound::SessionAttached {
            active_session_id,
            state,
            messages,
            snapshot,
            replay,
            last_event_sequence,
        } => {
            let snapshot = snapshot.unwrap_or_else(|| WireSnapshot {
                active_session_id: active_session_id.clone(),
                summary: state,
                state: Value::Null,
                messages,
                last_event_sequence: last_event_sequence.unwrap_or(0),
                last_event_cursor: replay.and_then(|replay| replay.to_cursor),
            });
            Outbound::SessionAttached(AttachmentRecord::Snapshot {
                active_session_id,
                snapshot,
            })
        }
        WireOutbound::SessionSnapshotBegin {
            active_session_id,
            snapshot_id,
            snapshot,
            message_count,
            target_chunk_bytes,
            purpose,
        } => Outbound::SnapshotBegin(AttachmentRecord::SnapshotBegin {
            active_session_id,
            snapshot_id,
            snapshot,
            message_count,
            target_chunk_bytes,
            purpose,
        }),
        WireOutbound::SessionSnapshotChunk {
            active_session_id,
            snapshot_id,
            index,
            messages,
        } => Outbound::SnapshotChunk(AttachmentRecord::SnapshotChunk {
            active_session_id,
            snapshot_id,
            index,
            messages,
        }),
        WireOutbound::SessionSnapshotEnd {
            active_session_id,
            snapshot_id,
            chunk_count,
            last_event_sequence,
            last_event_cursor,
        } => Outbound::SnapshotEnd(AttachmentRecord::SnapshotEnd {
            active_session_id,
            snapshot_id,
            chunk_count,
            last_event_sequence,
            last_event_cursor,
        }),
        WireOutbound::SessionSnapshotFailed {
            active_session_id,
            snapshot_id,
            error,
        } => Outbound::SnapshotFailed(AttachmentRecord::SnapshotFailed {
            active_session_id,
            snapshot_id,
            error,
        }),
        WireOutbound::SessionDetached { active_session_id } => {
            Outbound::SessionDetached(AttachmentRecord::Detached { active_session_id })
        }
        WireOutbound::SessionClosed {
            active_session_id,
            reason,
            meta,
        } => {
            let _ = meta;
            Outbound::SessionClosed(AttachmentRecord::Closed {
                active_session_id,
                reason,
            })
        }
        WireOutbound::ExtensionUiRequest {
            active_session_id,
            id,
            method,
            payload,
        } => {
            let _ = (active_session_id, id, method, payload);
            Outbound::ExtensionUiRequest
        }
        WireOutbound::ExtensionError {
            active_session_id,
            extension_path,
            event,
            error,
        } => {
            let _ = (active_session_id, extension_path, event, error);
            Outbound::ExtensionError
        }
    })
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub(crate) struct EventCursor {
    pub(crate) generation: String,
    pub(crate) sequence: u64,
}

#[derive(Debug)]
pub(crate) enum AttachmentRecord {
    Event {
        active_session_id: String,
        event: Value,
        cursor: Option<EventCursor>,
    },
    Status {
        active_session_id: String,
        recap: Option<String>,
        cursor: Option<EventCursor>,
    },
    Replaced {
        active_session_id: String,
        state: Value,
        messages: Vec<Value>,
        snapshot_follows: bool,
        cursor: Option<EventCursor>,
    },
    Snapshot {
        active_session_id: String,
        snapshot: WireSnapshot,
    },
    SnapshotBegin {
        active_session_id: String,
        snapshot_id: String,
        snapshot: WireSnapshotHeader,
        message_count: usize,
        target_chunk_bytes: usize,
        purpose: Option<String>,
    },
    SnapshotChunk {
        active_session_id: String,
        snapshot_id: String,
        index: usize,
        messages: Vec<Value>,
    },
    SnapshotEnd {
        active_session_id: String,
        snapshot_id: String,
        chunk_count: usize,
        last_event_sequence: u64,
        last_event_cursor: Option<EventCursor>,
    },
    SnapshotFailed {
        active_session_id: String,
        snapshot_id: String,
        error: String,
    },
    Detached {
        active_session_id: String,
    },
    Closed {
        active_session_id: String,
        reason: String,
    },
}

impl AttachmentRecord {
    pub(crate) fn active_session_id(&self) -> &str {
        match self {
            Self::Event {
                active_session_id, ..
            }
            | Self::Status {
                active_session_id, ..
            }
            | Self::Replaced {
                active_session_id, ..
            }
            | Self::Snapshot {
                active_session_id, ..
            }
            | Self::SnapshotBegin {
                active_session_id, ..
            }
            | Self::SnapshotChunk {
                active_session_id, ..
            }
            | Self::SnapshotEnd {
                active_session_id, ..
            }
            | Self::SnapshotFailed {
                active_session_id, ..
            }
            | Self::Detached { active_session_id }
            | Self::Closed {
                active_session_id, ..
            } => active_session_id,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WireSnapshot {
    active_session_id: String,
    summary: WireSessionSummary,
    state: Value,
    messages: Vec<Value>,
    last_event_sequence: u64,
    last_event_cursor: Option<EventCursor>,
}

impl WireSnapshot {
    pub(crate) fn validate(self) -> Result<ValidatedSnapshot, ProtocolError> {
        if self.active_session_id.trim().is_empty() || self.messages.len() > MAX_SNAPSHOT_MESSAGES {
            return Err(ProtocolError::InvalidField {
                message_type: "session snapshot",
                field: "shape",
            });
        }
        let cursor = self.last_event_cursor.unwrap_or(EventCursor {
            generation: self.active_session_id.clone(),
            sequence: self.last_event_sequence,
        });
        if cursor.generation.trim().is_empty() || cursor.sequence != self.last_event_sequence {
            return Err(ProtocolError::InvalidField {
                message_type: "session snapshot",
                field: "lastEventCursor",
            });
        }
        let _ = self.state;
        Ok(ValidatedSnapshot {
            active_session_id: self.active_session_id,
            summary: self.summary,
            messages: self.messages,
            cursor,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WireSnapshotHeader {
    active_session_id: String,
    summary: WireSessionSummary,
    state: Value,
    last_event_sequence: u64,
    last_event_cursor: Option<EventCursor>,
}

impl WireSnapshotHeader {
    pub(crate) fn finish(
        self,
        messages: Vec<Value>,
        last_event_sequence: u64,
        last_event_cursor: Option<EventCursor>,
    ) -> Result<ValidatedSnapshot, ProtocolError> {
        let _ = (self.last_event_sequence, self.last_event_cursor);
        WireSnapshot {
            active_session_id: self.active_session_id,
            summary: self.summary,
            state: self.state,
            messages,
            last_event_sequence,
            last_event_cursor,
        }
        .validate()
    }
}

#[derive(Debug)]
pub(crate) struct ValidatedSnapshot {
    pub(crate) active_session_id: String,
    pub(crate) summary: WireSessionSummary,
    pub(crate) messages: Vec<Value>,
    pub(crate) cursor: EventCursor,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireAttachResult {
    snapshot: WireSnapshot,
    snapshot_stream: Option<WireSnapshotStream>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireSnapshotStream {
    id: String,
    message_count: usize,
    target_chunk_bytes: usize,
}

pub(crate) enum AttachResponse {
    Inline(ValidatedSnapshot),
    Streamed,
}

pub(crate) fn parse_attach_response(data: Option<Value>) -> Result<AttachResponse, ProtocolError> {
    let data = data.ok_or(ProtocolError::InvalidResponseData("attach"))?;
    let result: WireAttachResult =
        serde_json::from_value(data).map_err(|_| ProtocolError::InvalidResponseData("attach"))?;
    if let Some(stream) = result.snapshot_stream {
        if stream.id.trim().is_empty()
            || stream.message_count > MAX_SNAPSHOT_MESSAGES
            || stream.target_chunk_bytes == 0
        {
            return Err(ProtocolError::InvalidResponseData("attach"));
        }
        Ok(AttachResponse::Streamed)
    } else {
        result.snapshot.validate().map(AttachResponse::Inline)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireReplay {
    to_cursor: Option<EventCursor>,
}

#[derive(Debug, Deserialize)]
struct WireEventMeta {
    sequence: Option<u64>,
    cursor: Option<EventCursor>,
}

impl WireEventMeta {
    fn cursor(self) -> Option<EventCursor> {
        self.cursor.or_else(|| {
            self.sequence.map(|sequence| EventCursor {
                generation: "legacy".to_owned(),
                sequence,
            })
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireHello {
    protocol: WireProtocolOwned,
    schema_id: Option<String>,
    schema_revision: Option<u32>,
    app_version: Option<String>,
    client_id: String,
    server_capabilities: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct WireProtocolOwned {
    name: String,
    version: u32,
}

#[derive(Serialize)]
struct WireCommandEnvelope<'a> {
    #[serde(rename = "type")]
    message_type: &'static str,
    id: &'a str,
    protocol: WireProtocol<'a>,
    #[serde(rename = "clientId")]
    client_id: &'a str,
    command: Map<String, Value>,
}

#[derive(Serialize)]
struct WireProtocol<'a> {
    name: &'a str,
    version: u32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WireResponse {
    pub(crate) id: Option<String>,
    pub(crate) command: String,
    pub(crate) success: bool,
    pub(crate) data: Option<Value>,
    pub(crate) error: Option<String>,
    #[serde(rename = "errorInfo")]
    pub(crate) error_info: Option<Value>,
}

impl WireResponse {
    pub(crate) fn into_result(self) -> Result<Option<Value>, RequestError> {
        if self.success {
            return Ok(self.data);
        }
        let code = self
            .error_info
            .as_ref()
            .and_then(|info| info.get("code"))
            .and_then(Value::as_str);
        if code == Some("command_result_uncertain") {
            return Err(RequestError::OutcomeUncertain);
        }
        Err(RequestError::Remote {
            command: self.command,
            message: self.error.unwrap_or_else(|| "request failed".to_owned()),
            code: code.map(str::to_owned),
        })
    }
}

pub(crate) fn parse_session_list(data: Option<Value>) -> Result<SessionList, ProtocolError> {
    let data = data.ok_or(ProtocolError::InvalidResponseData("list"))?;
    let list: WireSessionList =
        serde_json::from_value(data).map_err(|_| ProtocolError::InvalidResponseData("list"))?;
    let sessions = list
        .sessions
        .into_iter()
        .map(WireSessionSummary::into_summary)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(SessionList(sessions))
}

#[derive(Deserialize)]
struct WireSessionList {
    sessions: Vec<WireSessionSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WireSessionSummary {
    lifecycle: WireSessionLifecycle,
    activity: WireSessionActivity,
    active_session_id: Option<String>,
    session_id: String,
    session_name: Option<String>,
    cwd: PathBuf,
    attached_clients: u32,
    message_count: u64,
    worker_state: Option<WireWorkerState>,
}

impl WireSessionSummary {
    fn into_summary(self) -> Result<SessionSummary, ProtocolError> {
        if self.session_id.trim().is_empty() || self.cwd.as_os_str().is_empty() {
            return Err(ProtocolError::InvalidResponseData("list"));
        }
        Ok(SessionSummary {
            id: SessionId(self.session_id),
            active_id: self.active_session_id.map(ActiveSessionId),
            lifecycle: self.lifecycle.into(),
            activity: self.activity.into(),
            name: self.session_name,
            working_directory: self.cwd,
            message_count: self.message_count,
            attached_clients: self.attached_clients,
            worker_state: self.worker_state.map(Into::into),
        })
    }

    pub(crate) fn session_id(&self) -> &str {
        &self.session_id
    }

    pub(crate) fn activity(&self) -> SessionActivity {
        self.activity.into()
    }

    pub(crate) fn working_directory(&self) -> &PathBuf {
        &self.cwd
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum WireSessionLifecycle {
    Draft,
    Live,
    Archived,
}

impl From<WireSessionLifecycle> for SessionLifecycle {
    fn from(value: WireSessionLifecycle) -> Self {
        match value {
            WireSessionLifecycle::Draft => Self::Draft,
            WireSessionLifecycle::Live => Self::Live,
            WireSessionLifecycle::Archived => Self::Archived,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum WireSessionActivity {
    Working,
    Idle,
}

impl From<WireSessionActivity> for SessionActivity {
    fn from(value: WireSessionActivity) -> Self {
        match value {
            WireSessionActivity::Working => Self::Working,
            WireSessionActivity::Idle => Self::Idle,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum WireWorkerState {
    Starting,
    Ready,
    Recovering,
    Stopping,
    Failed,
}

impl From<WireWorkerState> for WorkerState {
    fn from(value: WireWorkerState) -> Self {
        match value {
            WireWorkerState::Starting => Self::Starting,
            WireWorkerState::Ready => Self::Ready,
            WireWorkerState::Recovering => Self::Recovering,
            WireWorkerState::Stopping => Self::Stopping,
            WireWorkerState::Failed => Self::Failed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server(schema_revision: Option<u32>, capabilities: &[ServerCapability]) -> ServerInfo {
        ServerInfo {
            protocol_version: 7,
            schema_id: None,
            schema_revision,
            app_version: None,
            capabilities: ServerCapabilities {
                known: capabilities.iter().copied().collect(),
                unknown: Vec::new(),
            },
        }
    }

    #[test]
    fn command_deadlines_match_the_command_role() {
        let completion = Command::checked("prompt_and_wait", Map::new()).expect("known command");
        let read = Command::list();

        assert_eq!(completion.deadline(), None);
        assert_eq!(read.deadline(), Some(Duration::from_secs(10)));
    }

    #[test]
    fn conditional_command_fields_add_all_five_compatibility_gates() {
        let cases = [
            (
                "attach",
                serde_json::json!({"recoveryConfig": {}}),
                17,
                Some("owned_session_recovery_context"),
            ),
            (
                "create",
                serde_json::json!({"config": {"telemetryDisabled": true}}),
                14,
                None,
            ),
            (
                "prompt",
                serde_json::json!({"admissionId": "one"}),
                8,
                Some("prompt_admission_cancellation"),
            ),
            (
                "wait_for_headless_completion",
                serde_json::json!({"waitForRlmQuiescence": true}),
                18,
                Some("rlm_quiescence_barrier"),
            ),
            (
                "cancel_prompt_admission",
                serde_json::json!({"cancelOwned": true}),
                20,
                Some("owned_prompt_cancellation"),
            ),
        ];
        for (name, value, revision, capability) in cases {
            let fields = value.as_object().expect("object").clone();
            let command = Command::checked(name, fields).expect("known command");
            let error = command
                .check_compatibility(&server(Some(revision - 1), &[]))
                .expect_err("old schema must fail");
            assert!(matches!(
                error,
                RequestError::SchemaUnavailable { required, .. } if required == revision
            ));
            if let Some(capability) = capability {
                let error = command
                    .check_compatibility(&server(Some(revision), &[]))
                    .expect_err("missing capability must fail");
                assert!(matches!(
                    error,
                    RequestError::CapabilityUnavailable { capability: missing, .. }
                        if missing == capability
                ));
            }
        }
    }

    #[test]
    fn frozen_envelope_keeps_identity_and_bytes() {
        let frozen = freeze_command(Command::list(), "client-random", "command-41".to_owned())
            .expect("command must freeze");
        let envelope: Value = serde_json::from_slice(&frozen.bytes).expect("valid JSON");

        assert_eq!(envelope["clientId"], "client-random");
        assert_eq!(envelope["id"], "command-41");
        assert_eq!(envelope["command"]["type"], "list");
    }

    #[test]
    fn uncertain_response_is_a_typed_outcome() {
        let response: WireResponse = serde_json::from_value(serde_json::json!({
            "id": "command-1",
            "command": "rename",
            "success": false,
            "error": "unknown result",
            "errorInfo": {
                "code": "command_result_uncertain",
                "clientId": "client-random",
                "commandId": "command-1"
            }
        }))
        .expect("response must parse");

        assert!(matches!(
            response.into_result(),
            Err(RequestError::OutcomeUncertain)
        ));
    }

    #[test]
    fn outbound_decoder_covers_the_checked_inventory() {
        assert_eq!(
            manifest::OUTBOUND_TYPES
                .iter()
                .copied()
                .collect::<std::collections::BTreeSet<_>>()
                .len(),
            20
        );
        assert_eq!(manifest::OUTBOUND_TYPES.len(), 20);
    }
}
