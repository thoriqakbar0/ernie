use std::collections::{HashMap, VecDeque};
use std::future::pending;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::unix::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::UnixStream;
use tokio::sync::{mpsc, oneshot, watch};
use tokio::time::{sleep, sleep_until, timeout};
use uuid::Uuid;

use crate::attachment::{AttachmentReducer, ReducerEffect};
use crate::protocol::{
    freeze_command, parse_attach_response, parse_hello, parse_outbound, parse_session_list,
    AttachResponse, AttachmentRecord, Command, FrozenCommand, MutationClass, Outbound,
};
use crate::{
    ActiveSessionId, Attachment, AttachmentState, ConnectError, DaemonEndpoint, ProtocolError,
    RequestError, ServerInfo, SessionList,
};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const HELLO_TIMEOUT: Duration = Duration::from_secs(3);
const RECONNECT_MIN_DELAY: Duration = Duration::from_millis(100);
const RECONNECT_MAX_DELAY: Duration = Duration::from_secs(2);
const TOMBSTONE_TTL: Duration = Duration::from_secs(60);
const MAX_TOMBSTONES: usize = 1_024;
const MAX_FRAME_BYTES: usize = 4 * 1024 * 1024;

/// A reconnecting Prime Agent daemon client.
#[derive(Clone)]
pub struct DaemonClient {
    commands: mpsc::Sender<ClientRequest>,
    server: Arc<ServerInfo>,
}

impl DaemonClient {
    /// Connects to a local daemon and validates `daemon_hello` before returning.
    pub async fn connect(endpoint: DaemonEndpoint) -> Result<Self, ConnectError> {
        let (commands, receiver) = mpsc::channel(32);
        let (connected_tx, connected_rx) = oneshot::channel();
        std::thread::Builder::new()
            .name("prime-agent-client".to_owned())
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build();
                match runtime {
                    Ok(runtime) => runtime.block_on(run_driver(endpoint, receiver, connected_tx)),
                    Err(_) => {
                        let _ = connected_tx.send(Err(ConnectError::DriverStopped));
                    }
                }
            })
            .map_err(|_| ConnectError::DriverStopped)?;
        let server = connected_rx
            .await
            .map_err(|_| ConnectError::DriverStopped)??;
        Ok(Self {
            commands,
            server: Arc::new(server),
        })
    }

    /// Returns facts accepted from the initial daemon greeting.
    pub fn initial_server_info(&self) -> &ServerInfo {
        &self.server
    }

    /// Lists the daemon's resident sessions.
    pub async fn list_sessions(&self) -> Result<SessionList, RequestError> {
        let (reply, result) = oneshot::channel();
        self.commands
            .send(ClientRequest::List { reply })
            .await
            .map_err(|_| RequestError::ConnectionClosed)?;
        let data = result.await.map_err(|_| RequestError::ConnectionClosed)??;
        parse_session_list(data).map_err(RequestError::from)
    }

    /// Selects one live session and starts its authoritative attachment stream.
    pub async fn attach_session(
        &self,
        active_session_id: ActiveSessionId,
    ) -> Result<Attachment, RequestError> {
        let initial = Arc::new(AttachmentState::Attaching {
            active_session_id: active_session_id.clone(),
        });
        let (updates, state) = watch::channel(initial);
        let (admitted, result) = oneshot::channel();
        self.commands
            .send(ClientRequest::Attach {
                active_session_id,
                updates,
                admitted,
            })
            .await
            .map_err(|_| RequestError::ConnectionClosed)?;
        result.await.map_err(|_| RequestError::ConnectionClosed)??;
        Ok(Attachment::new(state))
    }

    #[cfg(test)]
    async fn test_command(&self, command: Command) -> Result<Option<Value>, RequestError> {
        let (reply, result) = oneshot::channel();
        self.commands
            .send(ClientRequest::Test { command, reply })
            .await
            .map_err(|_| RequestError::ConnectionClosed)?;
        result.await.map_err(|_| RequestError::ConnectionClosed)?
    }
}

enum ClientRequest {
    List {
        reply: ResponseSender,
    },
    Attach {
        active_session_id: ActiveSessionId,
        updates: watch::Sender<Arc<AttachmentState>>,
        admitted: oneshot::Sender<Result<(), RequestError>>,
    },
    #[cfg(test)]
    Test {
        command: Command,
        reply: ResponseSender,
    },
}

type ResponseSender = oneshot::Sender<Result<Option<Value>, RequestError>>;

enum Completion {
    Response(Option<ResponseSender>),
    Attach,
}

impl Completion {
    fn resolve(&mut self, result: Result<Option<Value>, RequestError>) {
        if let Self::Response(reply) = self {
            if let Some(reply) = reply.take() {
                let _ = reply.send(result);
            }
        }
    }

    fn is_attach(&self) -> bool {
        matches!(self, Self::Attach)
    }
}

struct PendingRequest {
    command: FrozenCommand,
    completion: Completion,
    deadline: Option<Instant>,
}

struct Tombstone {
    id: String,
    command: &'static str,
    expires_at: Instant,
}

struct AckDebt {
    result_command_id: String,
    command: FrozenCommand,
}

struct SelectedAttachment {
    reducer: AttachmentReducer,
    updates: watch::Sender<Arc<AttachmentState>>,
}

struct DriverState {
    client_id: String,
    next_command: u64,
    server: ServerInfo,
    pending: HashMap<String, PendingRequest>,
    tombstones: VecDeque<Tombstone>,
    acknowledgement_debt: VecDeque<AckDebt>,
    selected: Option<SelectedAttachment>,
}

impl DriverState {
    fn new(server: ServerInfo) -> Self {
        Self {
            client_id: format!("ernie-gpui:{}", Uuid::new_v4()),
            next_command: 0,
            server,
            pending: HashMap::new(),
            tombstones: VecDeque::new(),
            acknowledgement_debt: VecDeque::new(),
            selected: None,
        }
    }

    fn next_command_id(&mut self) -> Result<String, ProtocolError> {
        self.next_command = self
            .next_command
            .checked_add(1)
            .ok_or(ProtocolError::CommandIdExhausted)?;
        Ok(format!("{}:{}", self.client_id, self.next_command))
    }

    fn issue(
        &mut self,
        command: Command,
        completion: Completion,
        now: Instant,
    ) -> Result<WriteFrame, RequestError> {
        command.check_compatibility(&self.server)?;
        let id = self.next_command_id()?;
        let frozen = freeze_command(command, &self.client_id, id.clone())?;
        let deadline = frozen.deadline.map(|duration| now + duration);
        let bytes = Arc::clone(&frozen.bytes);
        self.pending.insert(
            id,
            PendingRequest {
                command: frozen,
                completion,
                deadline,
            },
        );
        Ok(WriteFrame::Command(bytes))
    }

    fn select(
        &mut self,
        active_session_id: ActiveSessionId,
        updates: watch::Sender<Arc<AttachmentState>>,
        now: Instant,
    ) -> Result<WriteFrame, RequestError> {
        if let Some(previous) = self.selected.take() {
            let _ = previous.updates.send(Arc::new(AttachmentState::Superseded));
        }
        self.selected = Some(SelectedAttachment {
            reducer: AttachmentReducer::new(active_session_id.clone()),
            updates,
        });
        let command = Command::attach(&active_session_id, &self.client_id, None);
        match self.issue(command, Completion::Attach, now) {
            Ok(frame) => Ok(frame),
            Err(error) => {
                if let Some(selected) = self.selected.take() {
                    let _ = selected
                        .updates
                        .send(Arc::new(AttachmentState::Unavailable {
                            active_session_id,
                            reason: error.to_string().into(),
                        }));
                }
                Err(error)
            }
        }
    }

    fn on_response(
        &mut self,
        mut response: crate::protocol::WireResponse,
        now: Instant,
    ) -> Result<Vec<WriteFrame>, RequestError> {
        self.prune_tombstones(now);
        let id = response.id.take().ok_or(ProtocolError::InvalidField {
            message_type: "response",
            field: "id",
        })?;
        let Some(pending) = self.pending.get(&id) else {
            if let Some(index) = self
                .tombstones
                .iter()
                .position(|tombstone| tombstone.id == id)
            {
                let tombstone = self
                    .tombstones
                    .remove(index)
                    .expect("located tombstone must exist");
                if tombstone.command != response.command {
                    return Err(ProtocolError::ResponseCommandMismatch {
                        request_id: id,
                        expected: tombstone.command.to_owned(),
                        actual: response.command,
                    }
                    .into());
                }
                return Ok(Vec::new());
            }
            return Err(ProtocolError::UnknownResponseId(id).into());
        };
        if pending.command.name != response.command {
            return Err(ProtocolError::ResponseCommandMismatch {
                request_id: id,
                expected: pending.command.name.to_owned(),
                actual: response.command,
            }
            .into());
        }
        let mut pending = self
            .pending
            .remove(&id)
            .expect("checked pending request must still exist");
        let mut writes = Vec::new();
        if pending.command.mutation == MutationClass::Mutating {
            let acknowledgement = Command::acknowledgement(&pending.command.id);
            let acknowledgement_id = self.next_command_id()?;
            let frozen = freeze_command(acknowledgement, &self.client_id, acknowledgement_id)?;
            let bytes = Arc::clone(&frozen.bytes);
            self.acknowledgement_debt.push_back(AckDebt {
                result_command_id: pending.command.id.clone(),
                command: frozen,
            });
            writes.push(WriteFrame::Acknowledgement {
                result_command_id: pending.command.id.clone(),
                bytes,
            });
        }
        let result = response.into_result();
        if pending.completion.is_attach() {
            match result {
                Ok(data) => match parse_attach_response(data) {
                    Ok(AttachResponse::Inline(snapshot)) => {
                        writes.extend(self.apply_attachment_snapshot(snapshot, now)?);
                    }
                    Ok(AttachResponse::Streamed) => {}
                    Err(error) => {
                        writes.extend(self.resync_attachment(error.to_string(), now)?);
                    }
                },
                Err(error) => {
                    writes.extend(self.resync_attachment(error.to_string(), now)?);
                }
            }
        } else {
            pending.completion.resolve(result);
        }
        Ok(writes)
    }

    fn on_attachment_record(
        &mut self,
        record: AttachmentRecord,
        now: Instant,
    ) -> Result<Vec<WriteFrame>, RequestError> {
        let effects = self
            .selected
            .as_mut()
            .map(|selected| selected.reducer.on_record(record, now))
            .unwrap_or_default();
        self.apply_reducer_effects(effects, now)
    }

    fn apply_attachment_snapshot(
        &mut self,
        snapshot: crate::protocol::ValidatedSnapshot,
        now: Instant,
    ) -> Result<Vec<WriteFrame>, RequestError> {
        let effects = self
            .selected
            .as_mut()
            .map(|selected| selected.reducer.install_inline(snapshot))
            .unwrap_or_default();
        self.apply_reducer_effects(effects, now)
    }

    fn resync_attachment(
        &mut self,
        reason: String,
        now: Instant,
    ) -> Result<Vec<WriteFrame>, RequestError> {
        let record = self
            .selected
            .as_ref()
            .map(|selected| AttachmentRecord::SnapshotFailed {
                active_session_id: selected.reducer.target().as_str().to_owned(),
                snapshot_id: "attach-response".to_owned(),
                error: reason,
            });
        match record {
            Some(record) => self.on_attachment_record(record, now),
            None => Ok(Vec::new()),
        }
    }

    fn apply_reducer_effects(
        &mut self,
        effects: Vec<ReducerEffect>,
        now: Instant,
    ) -> Result<Vec<WriteFrame>, RequestError> {
        let mut resync = false;
        if let Some(selected) = self.selected.as_ref() {
            for effect in effects {
                match effect {
                    ReducerEffect::Publish(state) => {
                        let _ = selected.updates.send(state);
                    }
                    ReducerEffect::Resync => resync = true,
                }
            }
        }
        if !resync {
            return Ok(Vec::new());
        }
        self.issue_attachment(None, now).map(|frame| vec![frame])
    }

    fn issue_attachment(
        &mut self,
        resume: Option<crate::protocol::EventCursor>,
        now: Instant,
    ) -> Result<WriteFrame, RequestError> {
        self.pending
            .retain(|_, pending| !pending.completion.is_attach());
        let Some(selected) = self.selected.as_ref() else {
            return Err(RequestError::ConnectionClosed);
        };
        let command = Command::attach(selected.reducer.target(), &self.client_id, resume.as_ref());
        self.issue(command, Completion::Attach, now)
    }

    fn on_transport_lost(&mut self) {
        self.pending
            .retain(|_, pending| !pending.completion.is_attach());
        if let Some(selected) = self.selected.as_mut() {
            for effect in selected.reducer.on_transport_lost() {
                if let ReducerEffect::Publish(state) = effect {
                    let _ = selected.updates.send(state);
                }
            }
        }
    }

    fn on_reconnected(
        &mut self,
        server: ServerInfo,
        now: Instant,
    ) -> Result<Vec<WriteFrame>, RequestError> {
        self.server = server;
        let mut writes = Vec::new();
        let pending_ids = self.pending.keys().cloned().collect::<Vec<_>>();
        for id in pending_ids {
            let compatible = self
                .pending
                .get(&id)
                .expect("pending id must exist")
                .command
                .check_compatibility(&self.server);
            match compatible {
                Ok(()) => {
                    let bytes = Arc::clone(
                        &self
                            .pending
                            .get(&id)
                            .expect("pending id must exist")
                            .command
                            .bytes,
                    );
                    writes.push(WriteFrame::Command(bytes));
                }
                Err(error) => {
                    if let Some(mut pending) = self.pending.remove(&id) {
                        pending.completion.resolve(Err(error));
                    }
                }
            }
        }
        for debt in &self.acknowledgement_debt {
            writes.push(WriteFrame::Acknowledgement {
                result_command_id: debt.result_command_id.clone(),
                bytes: Arc::clone(&debt.command.bytes),
            });
        }
        let resume = self
            .selected
            .as_ref()
            .and_then(|selected| selected.reducer.resume_cursor().cloned());
        if self.selected.is_some() {
            writes.push(self.issue_attachment(resume, now)?);
        }
        Ok(writes)
    }

    fn mark_written(&mut self, frame: &WriteFrame) {
        if let WriteFrame::Acknowledgement {
            result_command_id, ..
        } = frame
        {
            self.acknowledgement_debt
                .retain(|debt| debt.result_command_id != *result_command_id);
        }
    }

    fn next_deadline(&self) -> Option<Instant> {
        self.pending
            .values()
            .filter_map(|pending| pending.deadline)
            .chain(
                self.selected
                    .iter()
                    .filter_map(|selected| selected.reducer.next_deadline()),
            )
            .min()
    }

    fn expire(&mut self, now: Instant) -> Result<Vec<WriteFrame>, RequestError> {
        self.prune_tombstones(now);
        let expired = self
            .pending
            .iter()
            .filter(|(_, pending)| pending.deadline.is_some_and(|deadline| deadline <= now))
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        for id in expired {
            let is_mutation = self
                .pending
                .get(&id)
                .is_some_and(|pending| pending.command.mutation == MutationClass::Mutating);
            if is_mutation {
                if let Some(pending) = self.pending.get_mut(&id) {
                    pending
                        .completion
                        .resolve(Err(RequestError::OutcomeUncertain));
                    pending.deadline = None;
                }
            } else if let Some(mut pending) = self.pending.remove(&id) {
                pending.completion.resolve(Err(RequestError::TimedOut));
                self.push_tombstone(Tombstone {
                    id,
                    command: pending.command.name,
                    expires_at: now + TOMBSTONE_TTL,
                });
            }
        }
        let effects = self
            .selected
            .as_mut()
            .map(|selected| selected.reducer.expire(now))
            .unwrap_or_default();
        self.apply_reducer_effects(effects, now)
    }

    fn push_tombstone(&mut self, tombstone: Tombstone) {
        if self.tombstones.len() == MAX_TOMBSTONES {
            self.tombstones.pop_front();
        }
        self.tombstones.push_back(tombstone);
    }

    fn prune_tombstones(&mut self, now: Instant) {
        while self
            .tombstones
            .front()
            .is_some_and(|tombstone| tombstone.expires_at <= now)
        {
            self.tombstones.pop_front();
        }
    }

    fn fail_all(mut self, error: Option<RequestError>) {
        for pending in self.pending.values_mut() {
            let error = error.clone().unwrap_or(RequestError::ConnectionClosed);
            pending.completion.resolve(Err(error));
        }
        if let Some(selected) = self.selected {
            let _ = selected
                .updates
                .send(Arc::new(AttachmentState::Unavailable {
                    active_session_id: selected.reducer.target().clone(),
                    reason: error
                        .map_or_else(|| "client closed".to_owned(), |error| error.to_string())
                        .into(),
                }));
        }
    }
}

enum WriteFrame {
    Command(Arc<[u8]>),
    Acknowledgement {
        result_command_id: String,
        bytes: Arc<[u8]>,
    },
}

impl WriteFrame {
    fn bytes(&self) -> &[u8] {
        match self {
            Self::Command(bytes) | Self::Acknowledgement { bytes, .. } => bytes,
        }
    }
}

struct Transport {
    reader: BufReader<OwnedReadHalf>,
    writer: OwnedWriteHalf,
    server: ServerInfo,
}

async fn connect_transport(endpoint: &DaemonEndpoint) -> Result<Transport, ConnectError> {
    let stream = timeout(CONNECT_TIMEOUT, UnixStream::connect(endpoint.path()))
        .await
        .map_err(|_| ConnectError::TimedOut)??;
    let (reader, writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let line = timeout(HELLO_TIMEOUT, read_frame(&mut reader))
        .await
        .map_err(|_| ConnectError::TimedOut)?
        .map_err(|error| match error {
            FrameReadError::Io(error) => ConnectError::Io(error),
            FrameReadError::Protocol(error) => ConnectError::Protocol(error),
        })?
        .ok_or(ConnectError::DriverStopped)?;
    let server = parse_hello(&line)?;
    Ok(Transport {
        reader,
        writer,
        server,
    })
}

async fn run_driver(
    endpoint: DaemonEndpoint,
    mut commands: mpsc::Receiver<ClientRequest>,
    connected: oneshot::Sender<Result<ServerInfo, ConnectError>>,
) {
    let transport = match connect_transport(&endpoint).await {
        Ok(transport) => transport,
        Err(error) => {
            let _ = connected.send(Err(error));
            return;
        }
    };
    let mut state = DriverState::new(transport.server.clone());
    if connected.send(Ok(transport.server.clone())).is_err() {
        return;
    }
    let mut transport = Some(transport);
    let mut reconnect_delay = RECONNECT_MIN_DELAY;

    loop {
        if let Some(active) = transport.as_mut() {
            let deadline = state.next_deadline();
            tokio::select! {
                request = commands.recv() => {
                    let Some(request) = request else {
                        state.fail_all(None);
                        return;
                    };
                    let frame = match admit_request(&mut state, request, Instant::now()) {
                        Ok(frame) => frame,
                        Err(error) => {
                            state.fail_all(Some(error));
                            return;
                        }
                    };
                    if let Some(frame) = frame {
                        if write_frame(active, &mut state, &frame).await.is_err() {
                            state.on_transport_lost();
                            transport = None;
                        }
                    }
                }
                line = read_frame(&mut active.reader) => {
                    let line = match line {
                        Ok(Some(line)) => line,
                        Ok(None) | Err(FrameReadError::Io(_)) => {
                            state.on_transport_lost();
                            transport = None;
                            continue;
                        }
                        Err(FrameReadError::Protocol(error)) => {
                            state.fail_all(Some(error.into()));
                            return;
                        }
                    };
                    let writes = match handle_line(&mut state, &line, Instant::now()) {
                        Ok(writes) => writes,
                        Err(error) => {
                            state.fail_all(Some(error));
                            return;
                        }
                    };
                    if write_frames(active, &mut state, &writes).await.is_err() {
                        state.on_transport_lost();
                        transport = None;
                    }
                }
                _ = wait_for_deadline(deadline) => {
                    let writes = match state.expire(Instant::now()) {
                        Ok(writes) => writes,
                        Err(error) => {
                            state.fail_all(Some(error));
                            return;
                        }
                    };
                    if write_frames(active, &mut state, &writes).await.is_err() {
                        state.on_transport_lost();
                        transport = None;
                    }
                }
            }
        } else {
            let deadline = state.next_deadline();
            tokio::select! {
                request = commands.recv() => {
                    let Some(request) = request else {
                        state.fail_all(None);
                        return;
                    };
                    if let Err(error) = admit_request(&mut state, request, Instant::now()) {
                        state.fail_all(Some(error));
                        return;
                    }
                }
                _ = sleep(reconnect_delay) => {
                    match connect_transport(&endpoint).await {
                        Ok(mut reconnected) => {
                            let writes = match state.on_reconnected(reconnected.server.clone(), Instant::now()) {
                                Ok(writes) => writes,
                                Err(error) => {
                                    state.fail_all(Some(error));
                                    return;
                                }
                            };
                            if write_frames(&mut reconnected, &mut state, &writes).await.is_ok() {
                                reconnect_delay = RECONNECT_MIN_DELAY;
                                transport = Some(reconnected);
                            } else {
                                state.on_transport_lost();
                                reconnect_delay = (reconnect_delay * 2).min(RECONNECT_MAX_DELAY);
                            }
                        }
                        Err(_) => {
                            reconnect_delay = (reconnect_delay * 2).min(RECONNECT_MAX_DELAY);
                        }
                    }
                }
                _ = wait_for_deadline(deadline) => {
                    if let Err(error) = state.expire(Instant::now()) {
                        state.fail_all(Some(error));
                        return;
                    }
                }
            }
        }
    }
}

fn admit_request(
    state: &mut DriverState,
    request: ClientRequest,
    now: Instant,
) -> Result<Option<WriteFrame>, RequestError> {
    match request {
        ClientRequest::List { reply } => state
            .issue(Command::list(), Completion::Response(Some(reply)), now)
            .map(Some),
        ClientRequest::Attach {
            active_session_id,
            updates,
            admitted,
        } => match state.select(active_session_id, updates, now) {
            Ok(frame) => {
                let _ = admitted.send(Ok(()));
                Ok(Some(frame))
            }
            Err(error) => {
                let _ = admitted.send(Err(error));
                Ok(None)
            }
        },
        #[cfg(test)]
        ClientRequest::Test { command, reply } => {
            if let Err(error) = command.check_compatibility(&state.server) {
                let _ = reply.send(Err(error));
                return Ok(None);
            }
            match state.issue(command, Completion::Response(Some(reply)), now) {
                Ok(frame) => Ok(Some(frame)),
                Err(error) => Err(error),
            }
        }
    }
}

fn handle_line(
    state: &mut DriverState,
    line: &str,
    now: Instant,
) -> Result<Vec<WriteFrame>, RequestError> {
    match parse_outbound(line)? {
        Outbound::Response(response) => state.on_response(response, now),
        Outbound::DaemonHello => Err(ProtocolError::DuplicateHello.into()),
        Outbound::DaemonClosing => Ok(Vec::new()),
        Outbound::SessionEvent(record)
        | Outbound::SessionStatus(record)
        | Outbound::SessionReplaced(record)
        | Outbound::SessionResynced(record)
        | Outbound::SessionAttached(record)
        | Outbound::SnapshotBegin(record)
        | Outbound::SnapshotChunk(record)
        | Outbound::SnapshotEnd(record)
        | Outbound::SnapshotFailed(record)
        | Outbound::SessionDetached(record)
        | Outbound::SessionClosed(record) => state.on_attachment_record(record, now),
        Outbound::SessionListProgress
        | Outbound::SessionListItem
        | Outbound::HeartbeatsChanged
        | Outbound::SideQuestionEvent
        | Outbound::ExtensionUiRequest
        | Outbound::ExtensionError => Ok(Vec::new()),
    }
}

async fn write_frame(
    transport: &mut Transport,
    state: &mut DriverState,
    frame: &WriteFrame,
) -> std::io::Result<()> {
    transport.writer.write_all(frame.bytes()).await?;
    state.mark_written(frame);
    Ok(())
}

async fn write_frames(
    transport: &mut Transport,
    state: &mut DriverState,
    frames: &[WriteFrame],
) -> std::io::Result<()> {
    for frame in frames {
        write_frame(transport, state, frame).await?;
    }
    Ok(())
}

async fn wait_for_deadline(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => sleep_until(deadline.into()).await,
        None => pending().await,
    }
}

#[derive(Debug)]
enum FrameReadError {
    Io(std::io::Error),
    Protocol(ProtocolError),
}

async fn read_frame<R>(reader: &mut R) -> Result<Option<String>, FrameReadError>
where
    R: AsyncBufRead + Unpin,
{
    let mut frame = Vec::new();
    let mut received_frame = false;
    loop {
        let available = reader.fill_buf().await.map_err(FrameReadError::Io)?;
        if available.is_empty() {
            break;
        }
        let newline = available.iter().position(|byte| *byte == b'\n');
        let consumed = newline.map_or(available.len(), |index| index + 1);
        let content = newline.map_or(available, |index| &available[..index]);
        if frame.len() + content.len() > MAX_FRAME_BYTES {
            return Err(FrameReadError::Protocol(ProtocolError::FrameTooLarge));
        }
        frame.extend_from_slice(content);
        reader.consume(consumed);
        if newline.is_some() {
            received_frame = true;
            break;
        }
    }
    if frame.is_empty() && !received_frame {
        return Ok(None);
    }
    if frame.last() == Some(&b'\r') {
        frame.pop();
    }
    String::from_utf8(frame)
        .map(Some)
        .map_err(|_| FrameReadError::Protocol(ProtocolError::InvalidUtf8))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::{BufRead, BufReader as StdBufReader, Write};
    use std::net::Shutdown;
    use std::os::unix::net::{UnixListener, UnixStream as StdUnixStream};
    use std::path::PathBuf;
    use std::sync::mpsc as std_mpsc;
    use std::time::{Duration, Instant};

    use serde_json::{Map, Value};
    use tokio::io::BufReader;
    use tokio::sync::oneshot;

    use super::{read_frame, DaemonClient, FrameReadError, MAX_FRAME_BYTES};
    use crate::protocol::{parse_hello, Command, WireResponse};
    use crate::{
        ActiveSessionId, AttachmentState, DaemonEndpoint, ProtocolError, RequestError,
        ServerCapability,
    };

    struct ScriptedDaemon {
        endpoint: DaemonEndpoint,
        directory: PathBuf,
        done: std_mpsc::Receiver<()>,
        thread: Option<std::thread::JoinHandle<()>>,
    }

    impl ScriptedDaemon {
        fn start(script: impl FnOnce(UnixListener) + Send + 'static) -> Self {
            let suffix = uuid::Uuid::new_v4().simple().to_string();
            let directory = PathBuf::from(format!("/tmp/epa-{}", &suffix[..8]));
            fs::create_dir_all(&directory).expect("test directory must exist");
            let socket_path = directory.join("daemon.sock");
            let listener = UnixListener::bind(&socket_path).expect("fake daemon must bind");
            let endpoint = DaemonEndpoint::at(socket_path).expect("endpoint must parse");
            let (done_tx, done) = std_mpsc::channel();
            let thread = std::thread::spawn(move || {
                script(listener);
                let _ = done_tx.send(());
            });
            Self {
                endpoint,
                directory,
                done,
                thread: Some(thread),
            }
        }

        fn wait(&self) {
            self.done
                .recv_timeout(Duration::from_secs(15))
                .expect("fake daemon script must finish");
        }
    }

    impl Drop for ScriptedDaemon {
        fn drop(&mut self) {
            if let Some(thread) = self.thread.take() {
                thread.join().expect("fake daemon must stop");
            }
            let _ = fs::remove_dir_all(&self.directory);
        }
    }

    fn accept(
        listener: &UnixListener,
        schema_revision: u32,
        capabilities: &[&str],
    ) -> (StdUnixStream, StdBufReader<StdUnixStream>) {
        let (mut stream, _) = listener.accept().expect("client must connect");
        writeln!(
            stream,
            "{}",
            serde_json::json!({
                "type": "daemon_hello",
                "socketPath": "/tmp/fake.sock",
                "protocol": {"name": "prime-agent.daemon", "version": 7},
                "schemaId": "protocol-7-schema-22-4d515169dc6b",
                "schemaRevision": schema_revision,
                "clientId": "connection-one",
                "serverCapabilities": capabilities,
            })
        )
        .expect("greeting must write");
        let reader = StdBufReader::new(stream.try_clone().expect("stream must clone"));
        (stream, reader)
    }

    fn read_request(reader: &mut StdBufReader<StdUnixStream>) -> (String, Value) {
        let mut line = String::new();
        reader.read_line(&mut line).expect("command must read");
        assert!(!line.is_empty(), "command must not be empty");
        let value = serde_json::from_str(&line).expect("command must be JSON");
        (line, value)
    }

    fn respond(stream: &mut StdUnixStream, request: &Value, success: bool, data: Value) {
        writeln!(
            stream,
            "{}",
            serde_json::json!({
                "type": "response",
                "id": request["id"],
                "command": request["command"]["type"],
                "success": success,
                "data": data,
            })
        )
        .expect("response must write");
    }

    fn empty_list() -> Value {
        serde_json::json!({"sessions": []})
    }

    fn snapshot(sequence: u64) -> Value {
        serde_json::json!({
            "activeSessionId": "active-one",
            "summary": {
                "id": "active-one",
                "lifecycle": "live",
                "activity": "idle",
                "activeSessionId": "active-one",
                "sessionId": "session-one",
                "cwd": "/tmp/project",
                "attachedClients": 1,
                "messageCount": 1
            },
            "state": {},
            "messages": [{}],
            "lastEventSequence": sequence,
            "lastEventCursor": {"generation": "generation-one", "sequence": sequence}
        })
    }

    fn attach_data(sequence: u64) -> Value {
        serde_json::json!({
            "protocol": {"name": "prime-agent.daemon", "version": 7},
            "activeSessionId": "active-one",
            "snapshot": snapshot(sequence),
            "replay": {"status": "complete", "toSequence": sequence},
            "lastEventSequence": sequence,
            "lastEventCursor": {"generation": "generation-one", "sequence": sequence},
            "client": {"id": "client", "capabilities": ["attach_snapshot", "event_sequence"]}
        })
    }

    fn rename_command() -> Command {
        Command::checked(
            "rename",
            Map::from_iter([
                (
                    "activeSessionId".to_owned(),
                    Value::String("active-one".to_owned()),
                ),
                ("name".to_owned(), Value::String("renamed".to_owned())),
            ]),
        )
        .expect("rename must exist")
    }

    #[tokio::test]
    async fn oversized_frame_is_rejected_before_json_parsing() {
        let input = vec![b'x'; MAX_FRAME_BYTES + 1];
        let mut reader = BufReader::new(input.as_slice());

        let error = read_frame(&mut reader).await.expect_err("frame must fail");

        assert!(matches!(
            error,
            FrameReadError::Protocol(ProtocolError::FrameTooLarge)
        ));
    }

    #[tokio::test]
    async fn client_identity_is_random_and_command_ids_are_monotonic() {
        let daemon = ScriptedDaemon::start(|listener| {
            let (mut stream, mut reader) = accept(&listener, 22, &[]);
            let (_, first) = read_request(&mut reader);
            respond(&mut stream, &first, true, empty_list());
            let (_, second) = read_request(&mut reader);
            respond(&mut stream, &second, true, empty_list());

            assert_eq!(first["clientId"], second["clientId"]);
            let client_id = first["clientId"].as_str().expect("client id must be text");
            let uuid = client_id
                .strip_prefix("ernie-gpui:")
                .expect("client id must use the Ernie prefix");
            uuid::Uuid::parse_str(uuid).expect("client id must contain a random UUID");
            assert_ne!(first["id"], second["id"]);
            assert!(second["id"]
                .as_str()
                .expect("command id must be text")
                .ends_with(":2"));
        });
        let client = DaemonClient::connect(daemon.endpoint.clone())
            .await
            .expect("client must connect");

        client.list_sessions().await.expect("first list must work");
        client.list_sessions().await.expect("second list must work");
        daemon.wait();
    }

    #[tokio::test]
    async fn mutation_replays_the_exact_frozen_envelope_after_reconnect() {
        let daemon = ScriptedDaemon::start(|listener| {
            let (first_stream, mut first_reader) = accept(&listener, 22, &[]);
            let (first_line, _) = read_request(&mut first_reader);
            first_stream
                .shutdown(Shutdown::Both)
                .expect("first connection must close");
            drop(first_stream);

            let (mut second_stream, mut second_reader) = accept(&listener, 22, &[]);
            let (replayed_line, replayed) = read_request(&mut second_reader);
            assert_eq!(replayed_line, first_line);
            respond(&mut second_stream, &replayed, true, serde_json::json!({}));
            let (_, acknowledgement) = read_request(&mut second_reader);
            assert_eq!(acknowledgement["command"]["type"], "ack_result");
            assert_eq!(acknowledgement["command"]["commandId"], replayed["id"]);
        });
        let client = DaemonClient::connect(daemon.endpoint.clone())
            .await
            .expect("client must connect");

        client
            .test_command(rename_command())
            .await
            .expect("replayed mutation must complete");
        daemon.wait();
    }

    #[tokio::test]
    async fn uncertain_mutation_is_typed_and_ack_result_needs_no_response() {
        let daemon = ScriptedDaemon::start(|listener| {
            let (mut stream, mut reader) = accept(&listener, 22, &[]);
            let (_, mutation) = read_request(&mut reader);
            writeln!(
                stream,
                "{}",
                serde_json::json!({
                    "type": "response",
                    "id": mutation["id"],
                    "command": "rename",
                    "success": false,
                    "error": "result uncertain",
                    "errorInfo": {
                        "code": "command_result_uncertain",
                        "clientId": mutation["clientId"],
                        "commandId": mutation["id"]
                    }
                })
            )
            .expect("uncertain response must write");
            let (_, acknowledgement) = read_request(&mut reader);
            assert_eq!(acknowledgement["command"]["type"], "ack_result");
            let (_, list) = read_request(&mut reader);
            respond(&mut stream, &list, true, empty_list());
        });
        let client = DaemonClient::connect(daemon.endpoint.clone())
            .await
            .expect("client must connect");

        assert!(matches!(
            client.test_command(rename_command()).await,
            Err(RequestError::OutcomeUncertain)
        ));
        client
            .list_sessions()
            .await
            .expect("response-less acknowledgement must not block the driver");
        daemon.wait();
    }

    #[test]
    fn acknowledgement_debt_clears_only_after_a_successful_local_write() {
        let hello = serde_json::json!({
            "type": "daemon_hello",
            "socketPath": "/tmp/fake.sock",
            "protocol": {"name": "prime-agent.daemon", "version": 7},
            "schemaRevision": 22,
            "clientId": "connection-one",
            "serverCapabilities": []
        })
        .to_string();
        let server = parse_hello(&hello).expect("hello must parse");
        let mut state = super::DriverState::new(server.clone());
        let (reply, _) = oneshot::channel();
        state
            .issue(
                rename_command(),
                super::Completion::Response(Some(reply)),
                Instant::now(),
            )
            .expect("mutation must issue");
        let command_id = state.pending.keys().next().expect("pending id").clone();
        let response: WireResponse = serde_json::from_value(serde_json::json!({
            "id": command_id,
            "command": "rename",
            "success": true,
            "data": {}
        }))
        .expect("response must parse");

        let writes = state
            .on_response(response, Instant::now())
            .expect("response must route");

        assert_eq!(state.acknowledgement_debt.len(), 1);
        let replay = state
            .on_reconnected(server, Instant::now())
            .expect("reconnect must prepare writes");
        assert_eq!(replay.len(), 1);
        state.mark_written(&writes[0]);
        assert!(state.acknowledgement_debt.is_empty());
    }

    #[tokio::test]
    async fn late_read_response_consumes_a_tombstone_and_the_driver_stays_live() {
        let daemon = ScriptedDaemon::start(|listener| {
            let (mut stream, mut reader) = accept(&listener, 22, &[]);
            let (_, first) = read_request(&mut reader);
            std::thread::sleep(Duration::from_millis(10_100));
            respond(&mut stream, &first, true, empty_list());
            let (_, second) = read_request(&mut reader);
            respond(&mut stream, &second, true, empty_list());
        });
        let client = DaemonClient::connect(daemon.endpoint.clone())
            .await
            .expect("client must connect");

        assert!(matches!(
            client.list_sessions().await,
            Err(RequestError::TimedOut)
        ));
        client
            .list_sessions()
            .await
            .expect("late response must not stop the driver");
        daemon.wait();
    }

    #[tokio::test]
    async fn missing_command_capability_rejects_before_the_socket_write() {
        let daemon = ScriptedDaemon::start(|listener| {
            let (mut stream, mut reader) = accept(&listener, 7, &[]);
            let (_, first) = read_request(&mut reader);
            assert_eq!(first["command"]["type"], "list");
            respond(&mut stream, &first, true, empty_list());
        });
        let client = DaemonClient::connect(daemon.endpoint.clone())
            .await
            .expect("client must connect");
        let command = Command::checked(
            "prompt",
            Map::from_iter([(
                "activeSessionId".to_owned(),
                Value::String("active-one".to_owned()),
            )]),
        )
        .expect("prompt must exist");

        assert!(matches!(
            client.test_command(command).await,
            Err(RequestError::CapabilityUnavailable {
                capability: "session_input_admission",
                ..
            })
        ));
        client
            .list_sessions()
            .await
            .expect("compatibility failure must not stop the driver");
        daemon.wait();
    }

    #[tokio::test]
    async fn attachment_buffers_early_events_until_the_inline_snapshot() {
        let daemon = ScriptedDaemon::start(|listener| {
            let (mut stream, mut reader) = accept(
                &listener,
                22,
                &["attach_snapshot", "event_sequence", "chunked_snapshot"],
            );
            let (_, attach) = read_request(&mut reader);
            writeln!(
                stream,
                "{}",
                serde_json::json!({
                    "type": "session_event",
                    "activeSessionId": "active-one",
                    "event": {"type": "idle"},
                    "meta": {"cursor": {"generation":"generation-one", "sequence": 2}}
                })
            )
            .expect("early event must write");
            respond(&mut stream, &attach, true, attach_data(1));
            let (_, list) = read_request(&mut reader);
            assert_eq!(list["command"]["type"], "list");
            respond(&mut stream, &list, true, empty_list());
        });
        let client = DaemonClient::connect(daemon.endpoint.clone())
            .await
            .expect("client must connect");
        let attachment = client
            .attach_session(ActiveSessionId::parse("active-one").expect("valid id"))
            .await
            .expect("attachment must register");
        let mut updates = attachment.subscribe();

        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                if matches!(
                    updates.borrow().as_ref(),
                    AttachmentState::Ready(view) if view.local_revision() == 2
                ) {
                    break;
                }
                updates.changed().await.expect("attachment must stay open");
            }
        })
        .await
        .expect("attachment must become ready");
        client
            .list_sessions()
            .await
            .expect("ready observation must release the fake daemon");
        daemon.wait();
    }

    #[tokio::test]
    async fn reconnect_uses_attach_with_the_last_resume_cursor() {
        let daemon = ScriptedDaemon::start(|listener| {
            let (mut first_stream, mut first_reader) = accept(
                &listener,
                22,
                &["attach_snapshot", "event_sequence", "chunked_snapshot"],
            );
            let (_, first_attach) = read_request(&mut first_reader);
            respond(&mut first_stream, &first_attach, true, attach_data(5));
            std::thread::sleep(Duration::from_millis(100));
            first_stream
                .shutdown(Shutdown::Both)
                .expect("first connection must close");
            drop(first_stream);

            let (mut second_stream, mut second_reader) = accept(
                &listener,
                22,
                &["attach_snapshot", "event_sequence", "chunked_snapshot"],
            );
            let (_, resumed) = read_request(&mut second_reader);
            assert_eq!(resumed["command"]["type"], "attach");
            assert_eq!(resumed["command"]["resumeCursor"]["sequence"], 5);
            assert_eq!(
                resumed["command"]["resumeCursor"]["generation"],
                "generation-one"
            );
            respond(&mut second_stream, &resumed, true, attach_data(5));
            let (_, list) = read_request(&mut second_reader);
            assert_eq!(list["command"]["type"], "list");
            respond(&mut second_stream, &list, true, empty_list());
        });
        let client = DaemonClient::connect(daemon.endpoint.clone())
            .await
            .expect("client must connect");
        let attachment = client
            .attach_session(ActiveSessionId::parse("active-one").expect("valid id"))
            .await
            .expect("attachment must register");

        let mut updates = attachment.subscribe();
        tokio::time::timeout(Duration::from_secs(3), async {
            let mut saw_resync = false;
            loop {
                match updates.borrow().as_ref() {
                    AttachmentState::Resyncing { .. } => saw_resync = true,
                    AttachmentState::Ready(_) if saw_resync => break,
                    _ => {}
                }
                updates.changed().await.expect("attachment must stay open");
            }
        })
        .await
        .expect("resumed attachment must become ready");
        client
            .list_sessions()
            .await
            .expect("ready observation must release the fake daemon");
        daemon.wait();
    }

    #[tokio::test]
    async fn streamed_snapshot_validates_and_publishes_complete_messages() {
        let daemon = ScriptedDaemon::start(|listener| {
            let (mut stream, mut reader) = accept(
                &listener,
                22,
                &["attach_snapshot", "event_sequence", "chunked_snapshot"],
            );
            let (_, attach) = read_request(&mut reader);
            let mut data = attach_data(0);
            data["snapshotStream"] = serde_json::json!({
                "id": "snapshot-one",
                "messageCount": 2,
                "targetChunkBytes": 1024
            });
            respond(&mut stream, &attach, true, data);
            let header = snapshot(0);
            writeln!(
                stream,
                "{}",
                serde_json::json!({
                    "type": "session_snapshot_begin",
                    "activeSessionId": "active-one",
                    "snapshotId": "snapshot-one",
                    "snapshot": {
                        "activeSessionId": header["activeSessionId"],
                        "summary": header["summary"],
                        "state": header["state"],
                        "lastEventSequence": 0,
                        "lastEventCursor": {"generation":"generation-one", "sequence":0}
                    },
                    "messageCount": 2,
                    "targetChunkBytes": 1024,
                    "purpose": "attach"
                })
            )
            .expect("snapshot begin must write");
            writeln!(
                stream,
                "{}",
                serde_json::json!({
                    "type": "session_snapshot_chunk",
                    "activeSessionId": "active-one",
                    "snapshotId": "snapshot-one",
                    "index": 0,
                    "messages": [{}, {}]
                })
            )
            .expect("snapshot chunk must write");
            writeln!(
                stream,
                "{}",
                serde_json::json!({
                    "type": "session_snapshot_end",
                    "activeSessionId": "active-one",
                    "snapshotId": "snapshot-one",
                    "chunkCount": 1,
                    "lastEventSequence": 0,
                    "lastEventCursor": {"generation":"generation-one", "sequence":0}
                })
            )
            .expect("snapshot end must write");
            let (_, list) = read_request(&mut reader);
            assert_eq!(list["command"]["type"], "list");
            respond(&mut stream, &list, true, empty_list());
        });
        let client = DaemonClient::connect(daemon.endpoint.clone())
            .await
            .expect("client must connect");
        let attachment = client
            .attach_session(ActiveSessionId::parse("active-one").expect("valid id"))
            .await
            .expect("attachment must register");
        let mut updates = attachment.subscribe();

        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                if matches!(
                    updates.borrow().as_ref(),
                    AttachmentState::Ready(view) if view.snapshot_message_count() == 2
                ) {
                    break;
                }
                updates.changed().await.expect("attachment must stay open");
            }
        })
        .await
        .expect("streamed snapshot must become ready");
        client
            .list_sessions()
            .await
            .expect("ready observation must release the fake daemon");
        daemon.wait();
    }

    #[test]
    fn server_capability_test_fixture_names_a_real_capability() {
        assert_eq!(
            ServerCapability::parse("attach_snapshot"),
            Some(ServerCapability::AttachSnapshot)
        );
    }
}
