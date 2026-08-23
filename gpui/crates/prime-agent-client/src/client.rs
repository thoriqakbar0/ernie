use std::collections::{HashMap, VecDeque};
use std::future::pending;
use std::sync::{Arc, Mutex};
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
    ActiveSessionId, Attachment, AttachmentError, AttachmentState, ConnectError, DaemonEndpoint,
    ProtocolError, RequestError, ServerInfo, SessionList,
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
    _driver: Arc<DriverOwner>,
}

struct DriverOwner {
    shutdown: watch::Sender<bool>,
    thread: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl Drop for DriverOwner {
    fn drop(&mut self) {
        let _ = self.shutdown.send(true);
        let Some(thread) = self.thread.lock().ok().and_then(|mut thread| thread.take()) else {
            return;
        };
        let _ = std::thread::Builder::new()
            .name("prime-agent-client-reaper".to_owned())
            .spawn(move || {
                let _ = thread.join();
            });
    }
}

impl DaemonClient {
    /// Connects to a local daemon and validates `daemon_hello` before returning.
    pub async fn connect(endpoint: DaemonEndpoint) -> Result<Self, ConnectError> {
        let (commands, receiver) = mpsc::channel(32);
        let (connected_tx, connected_rx) = oneshot::channel();
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let thread = std::thread::Builder::new()
            .name("prime-agent-client".to_owned())
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build();
                match runtime {
                    Ok(runtime) => {
                        runtime.block_on(run_driver(endpoint, receiver, connected_tx, shutdown_rx))
                    }
                    Err(_) => {
                        let _ = connected_tx.send(Err(ConnectError::DriverStopped));
                    }
                }
            })
            .map_err(|_| ConnectError::DriverStopped)?;
        let server = match connected_rx.await {
            Ok(Ok(server)) => server,
            Ok(Err(error)) => {
                let _ = thread.join();
                return Err(error);
            }
            Err(_) => {
                let _ = thread.join();
                return Err(ConnectError::DriverStopped);
            }
        };
        Ok(Self {
            commands,
            server: Arc::new(server),
            _driver: Arc::new(DriverOwner {
                shutdown: shutdown_tx,
                thread: Mutex::new(Some(thread)),
            }),
        })
    }

    /// Returns facts accepted from the initial daemon greeting.
    pub fn initial_server_info(&self) -> &ServerInfo {
        &self.server
    }

    /// Returns whether the local client driver has stopped accepting requests.
    pub fn is_closed(&self) -> bool {
        self.commands.is_closed()
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
    Attach {
        target: ActiveSessionId,
        role: AttachmentRole,
    },
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum AttachmentRole {
    Recovery,
    Selection,
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
        matches!(self, Self::Attach { .. })
    }

    fn attachment_target(&self) -> Option<&ActiveSessionId> {
        match self {
            Self::Attach { target, .. } => Some(target),
            Self::Response(_) => None,
        }
    }

    fn attachment_role(&self) -> Option<AttachmentRole> {
        match self {
            Self::Attach { role, .. } => Some(*role),
            Self::Response(_) => None,
        }
    }
}

struct PendingRequest {
    command: FrozenCommand,
    completion: Completion,
    deadline: Option<Instant>,
    write_state: CommandWriteState,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum CommandWriteState {
    NeverAttempted,
    WriteAttempted,
    Written,
}

struct Tombstone {
    id: String,
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
    pending_order: VecDeque<String>,
    tombstones: VecDeque<Tombstone>,
    acknowledgement_debt: VecDeque<AckDebt>,
    selected: Option<SelectedAttachment>,
    selecting: Option<SelectedAttachment>,
    selection_queue: VecDeque<SelectedAttachment>,
    confirmed_attachment: Option<ActiveSessionId>,
}

impl DriverState {
    fn new(server: ServerInfo) -> Self {
        Self {
            client_id: format!("ernie-gpui:{}", Uuid::new_v4()),
            next_command: 0,
            server,
            pending: HashMap::new(),
            pending_order: VecDeque::new(),
            tombstones: VecDeque::new(),
            acknowledgement_debt: VecDeque::new(),
            selected: None,
            selecting: None,
            selection_queue: VecDeque::new(),
            confirmed_attachment: None,
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
        self.pending_order.push_back(id.clone());
        self.pending.insert(
            id.clone(),
            PendingRequest {
                command: frozen,
                completion,
                deadline,
                write_state: CommandWriteState::NeverAttempted,
            },
        );
        Ok(WriteFrame::Command { id, bytes })
    }

    fn select(
        &mut self,
        active_session_id: ActiveSessionId,
        updates: watch::Sender<Arc<AttachmentState>>,
        now: Instant,
    ) -> Result<Option<WriteFrame>, RequestError> {
        Command::attach(&active_session_id, &self.client_id, None)
            .check_compatibility(&self.server)?;
        let requested = SelectedAttachment {
            reducer: AttachmentReducer::new(active_session_id.clone()),
            updates,
        };
        if self.selecting.is_some() {
            self.selection_queue.push_back(requested);
            return Ok(None);
        }
        self.selecting = Some(requested);
        match self.begin_selection(now) {
            Ok(frame) => Ok(Some(frame)),
            Err(error) => {
                self.fail_selecting(error.clone());
                Err(error)
            }
        }
    }

    fn begin_selection(&mut self, now: Instant) -> Result<WriteFrame, RequestError> {
        let Some(selecting) = self.selecting.as_mut() else {
            return Err(RequestError::ConnectionClosed);
        };
        let target = selecting.reducer.target().clone();
        selecting.reducer.start_command_attempt();
        let command = match self.confirmed_attachment.as_ref() {
            Some(previous) if previous != &target => {
                Command::reattach(previous, &target, &self.client_id)
            }
            _ => Command::attach(&target, &self.client_id, None),
        };
        self.issue(
            command,
            Completion::Attach {
                target,
                role: AttachmentRole::Selection,
            },
            now,
        )
    }

    fn fail_selecting(&mut self, error: RequestError) {
        if let Some(mut selecting) = self.selecting.take() {
            for effect in selecting
                .reducer
                .make_unavailable(AttachmentError::Request(error))
            {
                if let ReducerEffect::Publish(state) = effect {
                    let _ = selecting.updates.send(state);
                }
            }
        }
    }

    fn start_next_selection(&mut self, now: Instant) -> Vec<WriteFrame> {
        while self.selecting.is_none() {
            let Some(next) = self.selection_queue.pop_front() else {
                break;
            };
            self.selecting = Some(next);
            match self.begin_selection(now) {
                Ok(frame) => return vec![frame],
                Err(error) => self.fail_selecting(error),
            }
        }
        Vec::new()
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
                self.tombstones.remove(index);
                return Ok(Vec::new());
            }
            if self.is_issued_command_id(&id) {
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
            .take_pending(&id)
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
        if let Some(target) = pending.completion.attachment_target().cloned() {
            let role = pending
                .completion
                .attachment_role()
                .expect("attachment target must have a role");
            if self.attachment_for_target_mut(&target).is_none() {
                return Ok(writes);
            }
            match result {
                Ok(data) => {
                    self.confirmed_attachment = Some(target.clone());
                    match parse_attach_response(data) {
                        Ok(AttachResponse::Inline(snapshot)) => {
                            writes.extend(self.apply_attachment_snapshot(&target, snapshot, now)?);
                        }
                        Ok(AttachResponse::Streamed) => {
                            if let Some(attachment) = self.attachment_for_target_mut(&target) {
                                attachment.reducer.on_streamed_response(now);
                            }
                        }
                        Err(_) => {
                            writes.extend(self.resync_attachment(&target, now)?);
                        }
                    }
                }
                Err(error) => {
                    if role == AttachmentRole::Selection {
                        self.fail_selecting(error);
                        writes.extend(self.start_next_selection(now));
                    } else {
                        writes.extend(self.resync_attachment(&target, now)?);
                    }
                }
            }
        } else {
            pending.completion.resolve(result);
        }
        Ok(writes)
    }

    fn is_issued_command_id(&self, id: &str) -> bool {
        id.strip_prefix(&self.client_id)
            .and_then(|suffix| suffix.strip_prefix(':'))
            .and_then(|counter| counter.parse::<u64>().ok())
            .is_some_and(|counter| counter <= self.next_command)
    }

    fn take_pending(&mut self, id: &str) -> Option<PendingRequest> {
        let pending = self.pending.remove(id)?;
        self.pending_order.retain(|pending_id| pending_id != id);
        Some(pending)
    }

    fn on_attachment_record(
        &mut self,
        record: AttachmentRecord,
        now: Instant,
    ) -> Result<Vec<WriteFrame>, RequestError> {
        let target =
            ActiveSessionId::parse(record.active_session_id().to_owned()).map_err(|_| {
                ProtocolError::InvalidField {
                    message_type: "attachment",
                    field: "activeSessionId",
                }
            })?;
        let effects = self
            .attachment_for_target_mut(&target)
            .map(|attachment| attachment.reducer.on_record(record, now))
            .unwrap_or_default();
        self.apply_reducer_effects(&target, effects, now)
    }

    fn apply_attachment_snapshot(
        &mut self,
        target: &ActiveSessionId,
        snapshot: crate::protocol::ValidatedSnapshot,
        now: Instant,
    ) -> Result<Vec<WriteFrame>, RequestError> {
        let effects = self
            .attachment_for_target_mut(target)
            .map(|attachment| attachment.reducer.install_inline(snapshot))
            .unwrap_or_default();
        self.apply_reducer_effects(target, effects, now)
    }

    fn resync_attachment(
        &mut self,
        target: &ActiveSessionId,
        now: Instant,
    ) -> Result<Vec<WriteFrame>, RequestError> {
        self.on_attachment_record(
            AttachmentRecord::SnapshotFailed {
                active_session_id: target.as_str().to_owned(),
            },
            now,
        )
    }

    fn apply_reducer_effects(
        &mut self,
        target: &ActiveSessionId,
        effects: Vec<ReducerEffect>,
        now: Instant,
    ) -> Result<Vec<WriteFrame>, RequestError> {
        let mut resync = false;
        let mut ready = false;
        let mut terminal = false;
        if let Some(attachment) = self.attachment_for_target_mut(target) {
            for effect in effects {
                match effect {
                    ReducerEffect::Publish(state) => {
                        ready |= matches!(state.as_ref(), AttachmentState::Ready(_));
                        terminal |= matches!(
                            state.as_ref(),
                            AttachmentState::Detached { .. }
                                | AttachmentState::Closed { .. }
                                | AttachmentState::Unavailable { .. }
                        );
                        let _ = attachment.updates.send(state);
                    }
                    ReducerEffect::Resync => resync = true,
                }
            }
        }
        let is_selecting = self
            .selecting
            .as_ref()
            .is_some_and(|selecting| selecting.reducer.target() == target);
        let mut writes = Vec::new();
        if ready && is_selecting {
            self.promote_selecting();
            writes.extend(self.start_next_selection(now));
        } else if terminal {
            if self.confirmed_attachment.as_ref() == Some(target) {
                self.confirmed_attachment = None;
            }
            if is_selecting {
                self.selecting.take();
                writes.extend(self.start_next_selection(now));
            }
        }
        if resync {
            match self.issue_attachment(target, None, now) {
                Ok(frame) => writes.push(frame),
                Err(error) => {
                    writes.extend(self.fail_attachment(target, error, now));
                }
            }
        }
        Ok(writes)
    }

    fn issue_attachment(
        &mut self,
        target: &ActiveSessionId,
        resume: Option<crate::protocol::EventCursor>,
        now: Instant,
    ) -> Result<WriteFrame, RequestError> {
        let Some(attachment) = self.attachment_for_target_mut(target) else {
            return Err(RequestError::ConnectionClosed);
        };
        attachment.reducer.start_command_attempt();
        let target = target.clone();
        let command = Command::attach(&target, &self.client_id, resume.as_ref());
        self.issue(
            command,
            Completion::Attach {
                target,
                role: AttachmentRole::Recovery,
            },
            now,
        )
    }

    fn attachment_for_target_mut(
        &mut self,
        target: &ActiveSessionId,
    ) -> Option<&mut SelectedAttachment> {
        if self
            .selecting
            .as_ref()
            .is_some_and(|selecting| selecting.reducer.target() == target)
        {
            return self.selecting.as_mut();
        }
        self.selected
            .as_mut()
            .filter(|selected| selected.reducer.target() == target)
    }

    fn promote_selecting(&mut self) {
        let Some(replacement) = self.selecting.take() else {
            return;
        };
        if let Some(previous) = self.selected.take() {
            let _ = previous.updates.send(Arc::new(AttachmentState::Superseded));
        }
        self.selected = Some(replacement);
    }

    fn on_transport_lost(&mut self) {
        let attach_ids = self
            .pending_order
            .iter()
            .filter(|id| {
                self.pending
                    .get(*id)
                    .is_some_and(|pending| pending.completion.is_attach())
            })
            .cloned()
            .collect::<Vec<_>>();
        for id in attach_ids {
            self.take_pending(&id);
        }
        self.confirmed_attachment = None;
        let recovering = self.selecting.as_mut().or(self.selected.as_mut());
        if let Some(recovering) = recovering {
            for effect in recovering.reducer.on_transport_lost() {
                if let ReducerEffect::Publish(state) = effect {
                    let _ = recovering.updates.send(state);
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
        let pending_ids = self.pending_order.iter().cloned().collect::<Vec<_>>();
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
                    writes.push(WriteFrame::Command {
                        id: id.clone(),
                        bytes,
                    });
                }
                Err(error) => {
                    if let Some(mut pending) = self.take_pending(&id) {
                        let error = if pending.write_state != CommandWriteState::NeverAttempted
                            && pending.command.mutation == MutationClass::Mutating
                        {
                            RequestError::OutcomeUncertain
                        } else {
                            error
                        };
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
        if self
            .selecting
            .as_ref()
            .is_some_and(|attachment| attachment.reducer.is_terminal())
        {
            self.selecting.take();
            writes.extend(self.start_next_selection(now));
        }
        let recovering = self
            .selecting
            .as_ref()
            .filter(|attachment| !attachment.reducer.is_terminal())
            .or_else(|| {
                self.selected
                    .as_ref()
                    .filter(|attachment| !attachment.reducer.is_terminal())
            })
            .map(|attachment| {
                (
                    attachment.reducer.target().clone(),
                    attachment.reducer.resume_cursor().cloned(),
                )
            });
        if let Some((target, resume)) = recovering {
            match self.issue_attachment(&target, resume, now) {
                Ok(frame) => writes.push(frame),
                Err(error) => writes.extend(self.fail_attachment(&target, error, now)),
            }
        }
        Ok(writes)
    }

    fn mark_written(&mut self, frame: &WriteFrame) {
        match frame {
            WriteFrame::Command { id, .. } => {
                if let Some(pending) = self.pending.get_mut(id) {
                    pending.write_state = CommandWriteState::Written;
                }
            }
            WriteFrame::Acknowledgement {
                result_command_id, ..
            } => {
                self.acknowledgement_debt
                    .retain(|debt| debt.result_command_id != *result_command_id);
            }
        }
    }

    fn mark_write_attempted(&mut self, frame: &WriteFrame) {
        if let WriteFrame::Command { id, .. } = frame {
            if let Some(pending) = self.pending.get_mut(id) {
                pending.write_state = CommandWriteState::WriteAttempted;
            }
        }
    }

    fn fail_attachment(
        &mut self,
        target: &ActiveSessionId,
        error: RequestError,
        now: Instant,
    ) -> Vec<WriteFrame> {
        if let Some(attachment) = self.attachment_for_target_mut(target) {
            for effect in attachment
                .reducer
                .make_unavailable(AttachmentError::Request(error))
            {
                if let ReducerEffect::Publish(state) = effect {
                    let _ = attachment.updates.send(state);
                }
            }
        }
        if self.confirmed_attachment.as_ref() == Some(target) {
            self.confirmed_attachment = None;
        }
        if self
            .selecting
            .as_ref()
            .is_some_and(|selecting| selecting.reducer.target() == target)
        {
            self.selecting.take();
            return self.start_next_selection(now);
        }
        Vec::new()
    }

    fn next_deadline(&self) -> Option<Instant> {
        self.pending
            .values()
            .filter_map(|pending| pending.deadline)
            .chain(
                self.selecting
                    .iter()
                    .chain(self.selected.iter())
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
            } else if let Some(mut pending) = self.take_pending(&id) {
                pending.completion.resolve(Err(RequestError::TimedOut));
                self.push_tombstone(Tombstone {
                    id,
                    expires_at: now + TOMBSTONE_TTL,
                });
            }
        }
        let target = self
            .selecting
            .as_ref()
            .or(self.selected.as_ref())
            .map(|attachment| attachment.reducer.target().clone());
        let Some(target) = target else {
            return Ok(Vec::new());
        };
        let effects = self
            .attachment_for_target_mut(&target)
            .map(|attachment| attachment.reducer.expire(now))
            .unwrap_or_default();
        self.apply_reducer_effects(&target, effects, now)
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
            let error = if pending.command.mutation == MutationClass::Mutating
                && pending.write_state != CommandWriteState::NeverAttempted
            {
                RequestError::OutcomeUncertain
            } else {
                error.clone().unwrap_or(RequestError::ConnectionClosed)
            };
            pending.completion.resolve(Err(error));
        }
        let attachment_error = error.clone().unwrap_or(RequestError::ConnectionClosed);
        for selected in self.selecting.into_iter().chain(self.selected) {
            let _ = selected
                .updates
                .send(Arc::new(AttachmentState::Unavailable {
                    active_session_id: selected.reducer.target().clone(),
                    error: AttachmentError::Request(attachment_error.clone()),
                }));
        }
        for selected in self.selection_queue {
            let _ = selected
                .updates
                .send(Arc::new(AttachmentState::Unavailable {
                    active_session_id: selected.reducer.target().clone(),
                    error: AttachmentError::Request(attachment_error.clone()),
                }));
        }
    }
}

enum WriteFrame {
    Command {
        id: String,
        bytes: Arc<[u8]>,
    },
    Acknowledgement {
        result_command_id: String,
        bytes: Arc<[u8]>,
    },
}

impl WriteFrame {
    fn bytes(&self) -> &[u8] {
        match self {
            Self::Command { bytes, .. } | Self::Acknowledgement { bytes, .. } => bytes,
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
    mut shutdown: watch::Receiver<bool>,
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
                result = shutdown.changed() => {
                    if result.is_err() || *shutdown.borrow() {
                        state.fail_all(None);
                        return;
                    }
                }
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
                result = shutdown.changed() => {
                    if result.is_err() || *shutdown.borrow() {
                        state.fail_all(None);
                        return;
                    }
                }
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
                        Err(ConnectError::Protocol(error)) => {
                            state.fail_all(Some(RequestError::Protocol(error)));
                            return;
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
                Ok(frame)
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
    state.mark_write_attempted(frame);
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
    use std::sync::{mpsc as std_mpsc, Arc};
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

    #[tokio::test]
    async fn final_client_drop_stops_and_joins_the_local_driver() {
        let daemon = ScriptedDaemon::start(|listener| {
            let (_stream, mut reader) = accept(&listener, 22, &[]);
            let mut line = String::new();
            assert_eq!(
                reader
                    .read_line(&mut line)
                    .expect("socket read must finish"),
                0
            );
        });
        let client = DaemonClient::connect(daemon.endpoint.clone())
            .await
            .expect("client must connect");
        let retained = client.clone();

        drop(client);
        assert!(!retained.is_closed());
        drop(retained);

        daemon.wait();
    }

    fn server_info(schema_revision: u32, capabilities: &[&str]) -> crate::ServerInfo {
        parse_hello(
            &serde_json::json!({
                "type": "daemon_hello",
                "socketPath": "/tmp/fake.sock",
                "protocol": {"name": "prime-agent.daemon", "version": 7},
                "schemaId": "protocol-7-schema-22-4d515169dc6b",
                "schemaRevision": schema_revision,
                "clientId": "connection-one",
                "serverCapabilities": capabilities,
            })
            .to_string(),
        )
        .expect("server greeting must parse")
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
        snapshot_for("active-one", sequence)
    }

    fn snapshot_for(active_session_id: &str, sequence: u64) -> Value {
        serde_json::json!({
            "activeSessionId": active_session_id,
            "summary": {
                "id": active_session_id,
                "lifecycle": "live",
                "activity": "idle",
                "activeSessionId": active_session_id,
                "sessionId": format!("session-{active_session_id}"),
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
        attach_data_for("active-one", sequence)
    }

    fn attach_data_for(active_session_id: &str, sequence: u64) -> Value {
        serde_json::json!({
            "protocol": {"name": "prime-agent.daemon", "version": 7},
            "activeSessionId": active_session_id,
            "snapshot": snapshot_for(active_session_id, sequence),
            "replay": {"status": "complete", "toSequence": sequence},
            "lastEventSequence": sequence,
            "lastEventCursor": {"generation": "generation-one", "sequence": sequence},
            "client": {"id": "client", "capabilities": ["attach_snapshot", "event_sequence"]}
        })
    }

    async fn wait_until_ready(attachment: &crate::Attachment, active_session_id: &str) {
        let mut updates = attachment.subscribe();
        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                if matches!(
                    updates.borrow().as_ref(),
                    AttachmentState::Ready(view)
                        if view.active_session_id().as_str() == active_session_id
                ) {
                    break;
                }
                updates.changed().await.expect("attachment must stay open");
            }
        })
        .await
        .expect("attachment must become ready");
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

    #[test]
    fn reconnect_replays_pending_commands_in_admission_order() {
        let server = server_info(22, &["session_input_admission"]);
        let mut state = super::DriverState::new(server.clone());
        let now = Instant::now();
        let (first, _) = oneshot::channel();
        state
            .issue(
                Command::list(),
                super::Completion::Response(Some(first)),
                now,
            )
            .expect("first command must issue");
        let (second, _) = oneshot::channel();
        state
            .issue(
                rename_command(),
                super::Completion::Response(Some(second)),
                now,
            )
            .expect("second command must issue");
        let (third, _) = oneshot::channel();
        state
            .issue(
                Command::list(),
                super::Completion::Response(Some(third)),
                now,
            )
            .expect("third command must issue");

        let writes = state
            .on_reconnected(server, now)
            .expect("reconnect must prepare replay");
        let ids = writes
            .iter()
            .filter_map(|frame| match frame {
                super::WriteFrame::Command { id, .. } => Some(id.as_str()),
                super::WriteFrame::Acknowledgement { .. } => None,
            })
            .collect::<Vec<_>>();

        assert!(ids[0].ends_with(":1"));
        assert!(ids[1].ends_with(":2"));
        assert!(ids[2].ends_with(":3"));
    }

    #[test]
    fn attempted_mutation_becomes_uncertain_if_reconnect_loses_capability() {
        let server = server_info(22, &["session_input_admission"]);
        let mut state = super::DriverState::new(server);
        let command = Command::checked(
            "prompt",
            Map::from_iter([(
                "activeSessionId".to_owned(),
                Value::String("active-one".to_owned()),
            )]),
        )
        .expect("prompt must exist");
        let (reply, mut result) = oneshot::channel();
        let frame = state
            .issue(
                command,
                super::Completion::Response(Some(reply)),
                Instant::now(),
            )
            .expect("prompt must issue");
        state.mark_write_attempted(&frame);

        state
            .on_reconnected(server_info(22, &[]), Instant::now())
            .expect("compatibility loss must not stop reconnect");

        assert!(matches!(
            result.try_recv(),
            Ok(Err(RequestError::OutcomeUncertain))
        ));
    }

    #[test]
    fn optional_attachment_capabilities_do_not_block_reconnect() {
        let server = server_info(
            22,
            &["attach_snapshot", "event_sequence", "chunked_snapshot"],
        );
        let mut state = super::DriverState::new(server);
        let (updates, state_rx) =
            tokio::sync::watch::channel(Arc::new(AttachmentState::Attaching {
                active_session_id: ActiveSessionId::parse("active-one").expect("valid id"),
            }));
        state
            .select(
                ActiveSessionId::parse("active-one").expect("valid id"),
                updates,
                Instant::now(),
            )
            .expect("attachment must issue");
        state.on_transport_lost();
        let (reply, mut list_result) = oneshot::channel();
        state
            .issue(
                Command::list(),
                super::Completion::Response(Some(reply)),
                Instant::now(),
            )
            .expect("list must issue while reconnecting");

        let writes = state
            .on_reconnected(server_info(22, &[]), Instant::now())
            .expect("optional capability loss must not block reconnect");

        assert_eq!(writes.len(), 2);
        assert!(matches!(
            state_rx.borrow().as_ref(),
            AttachmentState::Resyncing { .. }
        ));
        assert!(matches!(
            list_result.try_recv(),
            Err(tokio::sync::oneshot::error::TryRecvError::Empty)
        ));
    }

    #[test]
    fn response_after_tombstone_expiry_is_ignored() {
        let server = server_info(22, &[]);
        let mut state = super::DriverState::new(server);
        let now = Instant::now();
        let (reply, _) = oneshot::channel();
        state
            .issue(
                Command::list(),
                super::Completion::Response(Some(reply)),
                now,
            )
            .expect("list must issue");
        let id = state
            .pending_order
            .front()
            .expect("pending id must exist")
            .clone();
        state
            .expire(now + Duration::from_secs(11))
            .expect("read deadline must expire");
        state.prune_tombstones(now + Duration::from_secs(72));
        let response: WireResponse = serde_json::from_value(serde_json::json!({
            "id": id,
            "command": "unexpected_after_expiry",
            "success": true,
            "data": {}
        }))
        .expect("response must parse");

        assert!(state
            .on_response(response, now + Duration::from_secs(72))
            .expect("stale response must be ignored")
            .is_empty());
    }

    #[test]
    fn response_after_tombstone_eviction_is_ignored() {
        let server = server_info(22, &[]);
        let mut state = super::DriverState::new(server);
        let now = Instant::now();
        for _ in 0..=super::MAX_TOMBSTONES {
            let (reply, _) = oneshot::channel();
            state
                .issue(
                    Command::list(),
                    super::Completion::Response(Some(reply)),
                    now,
                )
                .expect("list must issue");
        }
        state
            .expire(now + Duration::from_secs(11))
            .expect("read deadlines must expire");
        let evicted_id = (1..=state.next_command)
            .map(|counter| format!("{}:{counter}", state.client_id))
            .find(|id| !state.tombstones.iter().any(|tombstone| tombstone.id == *id))
            .expect("bounded tombstones must evict one id");
        let response: WireResponse = serde_json::from_value(serde_json::json!({
            "id": evicted_id,
            "command": "list",
            "success": true,
            "data": empty_list()
        }))
        .expect("response must parse");

        assert!(state
            .on_response(response, now + Duration::from_secs(11))
            .expect("evicted response must be ignored")
            .is_empty());
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
            let (_, refresh) = read_request(&mut reader);
            assert_eq!(refresh["command"]["type"], "attach");
            respond(&mut stream, &refresh, true, attach_data(2));
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
    async fn selecting_a_new_session_uses_atomic_reattach() {
        let daemon = ScriptedDaemon::start(|listener| {
            let (mut stream, mut reader) = accept(
                &listener,
                22,
                &["attach_snapshot", "event_sequence", "chunked_snapshot"],
            );
            let (_, first) = read_request(&mut reader);
            assert_eq!(first["command"]["type"], "attach");
            assert_eq!(first["command"]["activeSessionId"], "active-one");
            respond(&mut stream, &first, true, attach_data_for("active-one", 1));

            let (_, replacement) = read_request(&mut reader);
            assert_eq!(replacement["command"]["type"], "reattach");
            assert_eq!(replacement["command"]["activeSessionId"], "active-one");
            assert_eq!(
                replacement["command"]["targetActiveSessionId"],
                "active-two"
            );
            respond(
                &mut stream,
                &replacement,
                true,
                attach_data_for("active-two", 2),
            );
            let (_, list) = read_request(&mut reader);
            assert_eq!(list["command"]["type"], "list");
            respond(&mut stream, &list, true, empty_list());
        });
        let client = DaemonClient::connect(daemon.endpoint.clone())
            .await
            .expect("client must connect");
        let first = client
            .attach_session(ActiveSessionId::parse("active-one").expect("valid id"))
            .await
            .expect("first attachment must register");
        wait_until_ready(&first, "active-one").await;

        let replacement = client
            .attach_session(ActiveSessionId::parse("active-two").expect("valid id"))
            .await
            .expect("replacement attachment must register");
        wait_until_ready(&replacement, "active-two").await;
        assert!(matches!(
            first.state().as_ref(),
            AttachmentState::Superseded
        ));
        client
            .list_sessions()
            .await
            .expect("ready observation must release the fake daemon");
        daemon.wait();
    }

    #[tokio::test]
    async fn failed_reattach_preserves_the_confirmed_attachment() {
        let daemon = ScriptedDaemon::start(|listener| {
            let (mut stream, mut reader) = accept(
                &listener,
                22,
                &["attach_snapshot", "event_sequence", "chunked_snapshot"],
            );
            let (_, first) = read_request(&mut reader);
            respond(&mut stream, &first, true, attach_data_for("active-one", 1));

            let (_, replacement) = read_request(&mut reader);
            assert_eq!(replacement["command"]["type"], "reattach");
            writeln!(
                stream,
                "{}",
                serde_json::json!({
                    "type": "response",
                    "id": replacement["id"],
                    "command": "reattach",
                    "success": false,
                    "error": "target unavailable"
                })
            )
            .expect("failed reattach response must write");

            let (_, list) = read_request(&mut reader);
            respond(&mut stream, &list, true, empty_list());
        });
        let client = DaemonClient::connect(daemon.endpoint.clone())
            .await
            .expect("client must connect");
        let first = client
            .attach_session(ActiveSessionId::parse("active-one").expect("valid id"))
            .await
            .expect("first attachment must register");
        wait_until_ready(&first, "active-one").await;
        let replacement = client
            .attach_session(ActiveSessionId::parse("active-two").expect("valid id"))
            .await
            .expect("replacement attachment must register");
        let mut replacement_updates = replacement.subscribe();

        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                if matches!(
                    replacement.state().as_ref(),
                    AttachmentState::Unavailable { .. }
                ) {
                    break;
                }
                replacement_updates
                    .changed()
                    .await
                    .expect("attachment must stay open");
            }
        })
        .await
        .expect("failed replacement must become unavailable");
        assert!(matches!(first.state().as_ref(), AttachmentState::Ready(_)));
        client
            .list_sessions()
            .await
            .expect("driver must remain usable");
        daemon.wait();
    }

    #[tokio::test]
    async fn overlapping_selections_are_serialized_through_reattach() {
        let (release_first, released_first) = std_mpsc::channel();
        let daemon = ScriptedDaemon::start(move |listener| {
            let (mut stream, mut reader) = accept(
                &listener,
                22,
                &["attach_snapshot", "event_sequence", "chunked_snapshot"],
            );
            let (_, first) = read_request(&mut reader);
            assert_eq!(first["command"]["type"], "attach");
            released_first
                .recv_timeout(Duration::from_secs(2))
                .expect("test must queue the replacement");
            respond(&mut stream, &first, true, attach_data_for("active-one", 1));

            let (_, replacement) = read_request(&mut reader);
            assert_eq!(replacement["command"]["type"], "reattach");
            assert_eq!(replacement["command"]["activeSessionId"], "active-one");
            assert_eq!(
                replacement["command"]["targetActiveSessionId"],
                "active-two"
            );
            respond(
                &mut stream,
                &replacement,
                true,
                attach_data_for("active-two", 2),
            );
            let (_, list) = read_request(&mut reader);
            respond(&mut stream, &list, true, empty_list());
        });
        let client = DaemonClient::connect(daemon.endpoint.clone())
            .await
            .expect("client must connect");
        let first = client
            .attach_session(ActiveSessionId::parse("active-one").expect("valid id"))
            .await
            .expect("first attachment must register");
        let replacement = client
            .attach_session(ActiveSessionId::parse("active-two").expect("valid id"))
            .await
            .expect("replacement attachment must queue");
        release_first.send(()).expect("first response must release");

        wait_until_ready(&replacement, "active-two").await;
        assert!(matches!(
            first.state().as_ref(),
            AttachmentState::Superseded
        ));
        client
            .list_sessions()
            .await
            .expect("driver must remain usable");
        daemon.wait();
    }

    #[tokio::test]
    async fn incompatible_reconnect_greeting_stops_with_a_typed_failure() {
        let daemon = ScriptedDaemon::start(|listener| {
            let (first_stream, mut first_reader) = accept(&listener, 22, &[]);
            read_request(&mut first_reader);
            first_stream
                .shutdown(Shutdown::Both)
                .expect("first connection must close");
            drop(first_stream);

            let (mut second_stream, _) = listener.accept().expect("client must reconnect");
            writeln!(
                second_stream,
                "{}",
                serde_json::json!({
                    "type": "daemon_hello",
                    "socketPath": "/tmp/fake.sock",
                    "protocol": {"name": "prime-agent.daemon", "version": 8},
                    "schemaRevision": 22,
                    "clientId": "connection-two",
                    "serverCapabilities": []
                })
            )
            .expect("incompatible greeting must write");
        });
        let client = DaemonClient::connect(daemon.endpoint.clone())
            .await
            .expect("initial greeting must connect");

        assert!(matches!(
            client.list_sessions().await,
            Err(RequestError::Protocol(
                ProtocolError::IncompatibleProtocol { version: 8, .. }
            ))
        ));
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
