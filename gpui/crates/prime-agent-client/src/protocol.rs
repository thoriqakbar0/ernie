use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{
    manifest, ActiveSessionId, CommandResponse, DaemonCommand, DaemonEvent, ProtocolError,
    RequestError, ServerCapabilities, ServerCapability, ServerInfo, SessionActivity, SessionId,
    SessionLifecycle, SessionList, SessionSummary, WorkerState,
};

const PROTOCOL_NAME: &str = "prime-agent.daemon";
const PROTOCOL_VERSION: u32 = manifest::PROTOCOL_VERSION;

pub(crate) struct ProtocolCore<T> {
    state: CoreState,
    command_client_id: String,
    next_request: u64,
    pending: HashMap<String, Pending<T>>,
}

enum CoreState {
    AwaitingHello,
    Ready,
}

struct Pending<T> {
    command: String,
    completion: T,
    deadline: Instant,
}

pub(crate) struct IssuedCommand {
    pub(crate) request_id: String,
    pub(crate) bytes: Vec<u8>,
}

pub(crate) struct Completed<T> {
    pub(crate) completion: T,
    pub(crate) result: Result<CommandResponse, RequestError>,
}

pub(crate) enum Inbound<T> {
    Completed(Completed<T>),
    Event(DaemonEvent),
}

impl<T> ProtocolCore<T> {
    pub(crate) fn new(command_client_id: String) -> Self {
        Self {
            state: CoreState::AwaitingHello,
            command_client_id,
            next_request: 0,
            pending: HashMap::new(),
        }
    }

    pub(crate) fn accept_hello(&mut self, line: &str) -> Result<ServerInfo, ProtocolError> {
        if matches!(self.state, CoreState::Ready) {
            return Err(ProtocolError::DuplicateHello);
        }
        let value: Value = serde_json::from_str(line).map_err(|_| ProtocolError::MalformedJson)?;
        let message_type =
            value
                .get("type")
                .and_then(Value::as_str)
                .ok_or(ProtocolError::InvalidField {
                    message_type: "daemon_hello",
                    field: "type",
                })?;
        if message_type != "daemon_hello" {
            return Err(ProtocolError::MessageBeforeHello(message_type.to_owned()));
        }
        let hello: WireHello =
            serde_json::from_value(value).map_err(|_| ProtocolError::InvalidField {
                message_type: "daemon_hello",
                field: "shape",
            })?;
        if hello.protocol.name != PROTOCOL_NAME || hello.protocol.version != PROTOCOL_VERSION {
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
            match capability.as_str() {
                "attach_snapshot" => {
                    capabilities.known.insert(ServerCapability::AttachSnapshot);
                }
                "event_sequence" => {
                    capabilities.known.insert(ServerCapability::EventSequence);
                }
                "chunked_snapshot" => {
                    capabilities.known.insert(ServerCapability::ChunkedSnapshot);
                }
                "model_catalog" => {
                    capabilities.known.insert(ServerCapability::ModelCatalog);
                }
                _ => capabilities.unknown.push(capability),
            }
        }
        let server = ServerInfo {
            protocol_version: hello.protocol.version,
            schema_id: hello.schema_id,
            schema_revision: hello.schema_revision,
            app_version: hello.app_version,
            capabilities,
        };
        self.state = CoreState::Ready;
        Ok(server)
    }

    pub(crate) fn issue(
        &mut self,
        command: DaemonCommand,
        completion: T,
        deadline: Instant,
    ) -> Result<IssuedCommand, ProtocolError> {
        if !matches!(self.state, CoreState::Ready) {
            return Err(ProtocolError::MessageBeforeHello("list command".to_owned()));
        }
        self.next_request = self.next_request.saturating_add(1);
        let request_id = format!("ernie-gpui:{}", self.next_request);
        let (command_name, mut fields) = command.into_parts();
        fields.insert("type".to_owned(), Value::String(command_name.clone()));
        let envelope = WireCommandEnvelope {
            message_type: "command",
            id: &request_id,
            protocol: WireProtocol {
                name: PROTOCOL_NAME,
                version: PROTOCOL_VERSION,
            },
            client_id: &self.command_client_id,
            command: fields,
        };
        let mut bytes = serde_json::to_vec(&envelope).map_err(|_| ProtocolError::MalformedJson)?;
        bytes.push(b'\n');
        self.pending.insert(
            request_id.clone(),
            Pending {
                command: command_name,
                completion,
                deadline,
            },
        );
        Ok(IssuedCommand { request_id, bytes })
    }

    pub(crate) fn cancel(&mut self, request_id: &str) -> Option<T> {
        self.pending
            .remove(request_id)
            .map(|pending| pending.completion)
    }

    pub(crate) fn next_deadline(&self) -> Option<Instant> {
        self.pending.values().map(|pending| pending.deadline).min()
    }

    pub(crate) fn expire(&mut self, now: Instant) -> Vec<T> {
        let expired = self
            .pending
            .iter()
            .filter(|(_, pending)| pending.deadline <= now)
            .map(|(request_id, _)| request_id.clone())
            .collect::<Vec<_>>();
        expired
            .into_iter()
            .filter_map(|request_id| self.cancel(&request_id))
            .collect()
    }

    pub(crate) fn receive_line(&mut self, line: &str) -> Result<Option<Inbound<T>>, ProtocolError> {
        let value: Value = serde_json::from_str(line).map_err(|_| ProtocolError::MalformedJson)?;
        let message_type =
            value
                .get("type")
                .and_then(Value::as_str)
                .ok_or(ProtocolError::InvalidField {
                    message_type: "daemon outbound",
                    field: "type",
                })?;
        if message_type == "daemon_hello" {
            return Err(ProtocolError::DuplicateHello);
        }
        if message_type != "response" {
            if !manifest::recognizes_outbound(message_type) {
                return Err(ProtocolError::UnknownOutbound(message_type.to_owned()));
            }
            return Ok(Some(Inbound::Event(DaemonEvent {
                message_type: message_type.to_owned(),
                payload: value,
            })));
        }
        let response: WireResponse =
            serde_json::from_value(value).map_err(|_| ProtocolError::InvalidField {
                message_type: "response",
                field: "shape",
            })?;
        let request_id = response.id.ok_or(ProtocolError::InvalidField {
            message_type: "response",
            field: "id",
        })?;
        let pending = self
            .pending
            .get(&request_id)
            .ok_or_else(|| ProtocolError::UnknownResponseId(request_id.clone()))?;
        if response.command != pending.command {
            return Err(ProtocolError::ResponseCommandMismatch {
                request_id,
                expected: pending.command.clone(),
                actual: response.command,
            });
        }
        let pending = self
            .pending
            .remove(&request_id)
            .ok_or_else(|| ProtocolError::UnknownResponseId(request_id.clone()))?;
        let result = if response.success {
            Ok(CommandResponse {
                data: response.data,
            })
        } else {
            Err(RequestError::Remote {
                command: response.command,
                message: response
                    .error
                    .unwrap_or_else(|| "request failed".to_owned()),
                code: response
                    .error_info
                    .and_then(|info| info.get("code").and_then(Value::as_str).map(str::to_owned)),
            })
        };
        Ok(Some(Inbound::Completed(Completed {
            completion: pending.completion,
            result,
        })))
    }

    pub(crate) fn drain(self) -> impl Iterator<Item = T> {
        self.pending.into_values().map(|pending| pending.completion)
    }
}

pub(crate) fn parse_session_list(data: Option<Value>) -> Result<SessionList, ProtocolError> {
    let data = data.ok_or(ProtocolError::InvalidResponseData("list"))?;
    let list: WireSessionList =
        serde_json::from_value(data).map_err(|_| ProtocolError::InvalidResponseData("list"))?;
    let sessions = list
        .sessions
        .into_iter()
        .map(|session| {
            if session.session_id.trim().is_empty() || session.cwd.as_os_str().is_empty() {
                return Err(ProtocolError::InvalidResponseData("list"));
            }
            Ok(SessionSummary {
                id: SessionId(session.session_id),
                active_id: session.active_session_id.map(ActiveSessionId),
                lifecycle: session.lifecycle.into(),
                activity: session.activity.into(),
                name: session.session_name,
                working_directory: session.cwd,
                message_count: session.message_count,
                attached_clients: session.attached_clients,
                worker_state: session.worker_state.map(Into::into),
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(SessionList(sessions))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireHello {
    protocol: WireProtocolOwned,
    schema_id: Option<String>,
    schema_revision: Option<u32>,
    app_version: Option<String>,
    client_id: String,
    server_capabilities: Vec<String>,
}

#[derive(Deserialize)]
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

#[derive(Deserialize)]
struct WireResponse {
    id: Option<String>,
    command: String,
    success: bool,
    data: Option<Value>,
    error: Option<String>,
    #[serde(rename = "errorInfo")]
    error_info: Option<Value>,
}

#[derive(Deserialize)]
struct WireSessionList {
    sessions: Vec<WireSessionSummary>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireSessionSummary {
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

#[derive(Deserialize)]
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

#[derive(Deserialize)]
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

#[derive(Deserialize)]
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
    use std::time::{Duration, Instant};

    use super::{Inbound, ProtocolCore};
    use crate::{DaemonCommand, ProtocolError, ServerCapability};

    fn hello(capabilities: &str) -> String {
        format!(
            r#"{{"type":"daemon_hello","socketPath":"/tmp/prime.sock","protocol":{{"name":"prime-agent.daemon","version":7}},"schemaId":"protocol-7-schema-22-4d515169dc6b","schemaRevision":22,"clientId":"connection-one","serverCapabilities":[{capabilities}]}}"#
        )
    }

    #[test]
    fn greeting_accepts_unknown_optional_capabilities() {
        let mut core = ProtocolCore::<usize>::new("ernie".to_owned());

        let server = core
            .accept_hello(&hello(r#""attach_snapshot","future_capability""#))
            .expect("greeting must parse");

        assert!(server.supports(ServerCapability::AttachSnapshot));
        assert_eq!(
            server.unknown_capabilities().collect::<Vec<_>>(),
            ["future_capability"]
        );
    }

    #[test]
    fn response_is_correlated_by_id_and_command() {
        let mut core = ProtocolCore::new("ernie".to_owned());
        core.accept_hello(&hello("")).expect("greeting must parse");
        let issued = core
            .issue(
                DaemonCommand::new("list").expect("command must build"),
                41,
                Instant::now() + Duration::from_secs(1),
            )
            .expect("list must issue");
        let line = format!(
            r#"{{"type":"response","id":"{}","command":"list","success":true,"data":{{"sessions":[]}}}}"#,
            issued.request_id
        );

        let Inbound::Completed(completed) = core
            .receive_line(&line)
            .expect("response must parse")
            .expect("response must complete a request")
        else {
            panic!("response must complete a request");
        };

        assert_eq!(completed.completion, 41);
        assert_eq!(
            completed.result.expect("list must succeed").data(),
            Some(&serde_json::json!({ "sessions": [] }))
        );
    }

    #[test]
    fn generic_command_fields_are_written_inside_the_exact_envelope() {
        let mut core = ProtocolCore::new("ernie".to_owned());
        core.accept_hello(&hello("")).expect("greeting must parse");
        let command = DaemonCommand::new("get_messages")
            .expect("command must build")
            .with_field("activeSessionId", "active-one")
            .expect("field must encode");

        let issued = core
            .issue(command, 1, Instant::now() + Duration::from_secs(1))
            .expect("command must issue");
        let envelope: serde_json::Value =
            serde_json::from_slice(&issued.bytes).expect("envelope must be JSON");

        assert_eq!(envelope["type"], "command");
        assert_eq!(envelope["protocol"]["name"], "prime-agent.daemon");
        assert_eq!(envelope["protocol"]["version"], 7);
        assert_eq!(envelope["clientId"], "ernie");
        assert_eq!(envelope["command"]["type"], "get_messages");
        assert_eq!(envelope["command"]["activeSessionId"], "active-one");
    }

    #[test]
    fn recognized_events_are_forwarded_without_losing_fields() {
        let mut core = ProtocolCore::<usize>::new("ernie".to_owned());
        core.accept_hello(&hello("")).expect("greeting must parse");

        let Inbound::Event(event) = core
            .receive_line(
                r#"{"type":"session_event","activeSessionId":"active-one","event":{"type":"idle"}}"#,
            )
            .expect("event must parse")
            .expect("event must be returned")
        else {
            panic!("record must be an event");
        };

        assert_eq!(event.message_type(), "session_event");
        assert_eq!(event.payload()["activeSessionId"], "active-one");
        assert_eq!(event.payload()["event"]["type"], "idle");
    }

    #[test]
    fn unknown_outbound_records_are_rejected() {
        let mut core = ProtocolCore::<usize>::new("ernie".to_owned());
        core.accept_hello(&hello("")).expect("greeting must parse");

        assert!(matches!(
            core.receive_line(r#"{"type":"future_event"}"#),
            Err(ProtocolError::UnknownOutbound(name)) if name == "future_event"
        ));
    }

    #[test]
    fn mismatched_response_command_is_rejected() {
        let mut core = ProtocolCore::new("ernie".to_owned());
        core.accept_hello(&hello("")).expect("greeting must parse");
        let issued = core
            .issue(
                DaemonCommand::new("list").expect("command must build"),
                1,
                Instant::now() + Duration::from_secs(1),
            )
            .expect("list must issue");
        let line = format!(
            r#"{{"type":"response","id":"{}","command":"attach","success":true,"data":{{}}}}"#,
            issued.request_id
        );

        assert!(matches!(
            core.receive_line(&line),
            Err(ProtocolError::ResponseCommandMismatch { .. })
        ));
    }

    #[test]
    fn expired_request_is_removed_from_pending_commands() {
        let now = Instant::now();
        let mut core = ProtocolCore::new("ernie".to_owned());
        core.accept_hello(&hello("")).expect("greeting must parse");
        core.issue(
            DaemonCommand::new("list").expect("command must build"),
            7,
            now,
        )
        .expect("list must issue");

        assert_eq!(core.expire(now), [7]);
        assert!(core.next_deadline().is_none());
    }
}
