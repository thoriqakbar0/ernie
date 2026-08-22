use std::collections::{BTreeMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use thiserror::Error;
use tokio::sync::watch;

use crate::protocol::{AttachmentRecord, EventCursor, ValidatedSnapshot, WireSnapshotHeader};
use crate::{ActiveSessionId, ProtocolError, RequestError, SessionActivity, SessionId};

const MAX_EARLY_EVENTS: usize = 256;
const MAX_SNAPSHOT_BYTES: usize = 16 * 1024 * 1024;
const MAX_SNAPSHOT_CHUNKS: usize = 4_096;
const MAX_SNAPSHOT_MESSAGES: usize = 100_000;
const SNAPSHOT_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_CONSECUTIVE_RESYNCS: u8 = 3;

/// A coalesced view of one selected Prime Agent session.
pub struct Attachment {
    state: watch::Receiver<Arc<AttachmentState>>,
}

impl Attachment {
    pub(crate) fn new(state: watch::Receiver<Arc<AttachmentState>>) -> Self {
        Self { state }
    }

    /// Returns the newest complete attachment state.
    pub fn state(&self) -> Arc<AttachmentState> {
        self.state.borrow().clone()
    }

    /// Subscribes to replacement attachment states.
    pub fn subscribe(&self) -> watch::Receiver<Arc<AttachmentState>> {
        self.state.clone()
    }
}

/// State of the selected Prime Agent session.
#[derive(Clone, Debug)]
pub enum AttachmentState {
    /// The client registered the selection and awaits an authoritative snapshot.
    Attaching { active_session_id: ActiveSessionId },
    /// The client holds a complete snapshot and a contiguous event cursor.
    Ready(AttachedSession),
    /// The client retained the selection and requested a replacement snapshot.
    Resyncing { active_session_id: ActiveSessionId },
    /// The daemon detached the selected client.
    Detached { active_session_id: ActiveSessionId },
    /// The selected session closed.
    Closed {
        active_session_id: ActiveSessionId,
        /// Daemon close reason.
        reason: Arc<str>,
    },
    /// Recovery stopped after the bounded retry budget.
    Unavailable {
        active_session_id: ActiveSessionId,
        /// Typed attachment failure.
        error: AttachmentError,
    },
    /// A newer row selection replaced this attachment.
    Superseded,
}

/// Failure that made one selected attachment unavailable.
#[derive(Clone, Debug, Error)]
pub enum AttachmentError {
    /// Recovery exceeded its bounded resync budget.
    #[error("attachment recovery exceeded its retry limit")]
    RecoveryLimit,
    /// The client driver stopped the attachment.
    #[error(transparent)]
    Request(#[from] RequestError),
}

/// Typed projection of an authoritative Prime Agent attachment snapshot.
#[derive(Clone, Debug)]
pub struct AttachedSession {
    active_session_id: ActiveSessionId,
    session_id: SessionId,
    activity: SessionActivity,
    working_directory: PathBuf,
    snapshot_message_count: usize,
    revision: u64,
}

impl AttachedSession {
    pub fn active_session_id(&self) -> &ActiveSessionId {
        &self.active_session_id
    }

    /// Returns the durable session identifier from the latest snapshot.
    pub fn session_id(&self) -> &SessionId {
        &self.session_id
    }

    /// Returns the activity from the latest authoritative snapshot.
    pub fn activity(&self) -> SessionActivity {
        self.activity
    }

    /// Returns the working directory from the latest authoritative snapshot.
    pub fn working_directory(&self) -> &Path {
        &self.working_directory
    }

    /// Returns the transcript size in the latest authoritative snapshot.
    pub fn snapshot_message_count(&self) -> usize {
        self.snapshot_message_count
    }

    /// Returns the local replacement revision.
    pub fn local_revision(&self) -> u64 {
        self.revision
    }
}

pub(crate) enum ReducerEffect {
    Publish(Arc<AttachmentState>),
    Resync,
}

pub(crate) struct AttachmentReducer {
    target: ActiveSessionId,
    cursor: Option<EventCursor>,
    view: Option<AttachedSession>,
    early: VecDeque<Option<EventCursor>>,
    assembly: Option<SnapshotAssembly>,
    attempt: AttachmentAttempt,
    awaiting_snapshot: bool,
    consecutive_resyncs: u8,
    revision: u64,
    terminal: bool,
}

#[derive(Clone, Copy)]
enum AttachmentAttempt {
    Idle,
    Command,
    Stream { deadline: Instant },
}

impl AttachmentReducer {
    pub(crate) fn new(target: ActiveSessionId) -> Self {
        Self {
            target,
            cursor: None,
            view: None,
            early: VecDeque::new(),
            assembly: None,
            attempt: AttachmentAttempt::Idle,
            awaiting_snapshot: true,
            consecutive_resyncs: 0,
            revision: 0,
            terminal: false,
        }
    }

    pub(crate) fn target(&self) -> &ActiveSessionId {
        &self.target
    }

    pub(crate) fn resume_cursor(&self) -> Option<&EventCursor> {
        self.cursor.as_ref()
    }

    pub(crate) fn is_terminal(&self) -> bool {
        self.terminal
    }

    pub(crate) fn start_command_attempt(&mut self) {
        if !self.terminal {
            self.awaiting_snapshot = true;
            self.attempt = AttachmentAttempt::Command;
        }
    }

    pub(crate) fn on_streamed_response(&mut self, now: Instant) {
        if !self.terminal {
            self.awaiting_snapshot = true;
            self.attempt = AttachmentAttempt::Stream {
                deadline: now + SNAPSHOT_TIMEOUT,
            };
        }
    }

    pub(crate) fn make_unavailable(&mut self, error: AttachmentError) -> Vec<ReducerEffect> {
        self.terminal = true;
        self.attempt = AttachmentAttempt::Idle;
        self.assembly = None;
        self.early.clear();
        vec![ReducerEffect::Publish(Arc::new(
            AttachmentState::Unavailable {
                active_session_id: self.target.clone(),
                error,
            },
        ))]
    }

    pub(crate) fn on_transport_lost(&mut self) -> Vec<ReducerEffect> {
        if self.terminal {
            return Vec::new();
        }
        self.attempt = AttachmentAttempt::Idle;
        self.awaiting_snapshot = true;
        self.assembly = None;
        self.early.clear();
        self.consecutive_resyncs = self.consecutive_resyncs.saturating_add(1);
        if self.consecutive_resyncs > MAX_CONSECUTIVE_RESYNCS {
            return self.make_unavailable(AttachmentError::RecoveryLimit);
        }
        vec![ReducerEffect::Publish(Arc::new(
            AttachmentState::Resyncing {
                active_session_id: self.target.clone(),
            },
        ))]
    }

    pub(crate) fn on_record(
        &mut self,
        record: AttachmentRecord,
        now: Instant,
    ) -> Vec<ReducerEffect> {
        if self.terminal || record.active_session_id() != self.target.as_str() {
            return Vec::new();
        }
        match record {
            AttachmentRecord::Event { event, cursor, .. } => {
                let _ = event;
                self.on_cursor(cursor)
            }
            AttachmentRecord::Status { recap, cursor, .. } => {
                let _ = recap;
                self.on_cursor(cursor)
            }
            AttachmentRecord::Replaced {
                state,
                messages,
                snapshot_follows,
                cursor,
                ..
            } => {
                let _ = (state, messages, snapshot_follows, cursor);
                self.request_resync()
            }
            AttachmentRecord::Snapshot { snapshot, .. } => match snapshot.validate() {
                Ok(snapshot) => self.install(snapshot),
                Err(_) => self.retry_after_failure(),
            },
            AttachmentRecord::SnapshotBegin {
                snapshot_id,
                snapshot,
                message_count,
                target_chunk_bytes,
                purpose,
                ..
            } => {
                let _ = purpose;
                match SnapshotAssembly::new(
                    snapshot_id,
                    snapshot,
                    message_count,
                    target_chunk_bytes,
                    now,
                ) {
                    Ok(assembly) => {
                        self.awaiting_snapshot = true;
                        let deadline = match self.attempt {
                            AttachmentAttempt::Stream { deadline } => {
                                deadline.min(assembly.deadline)
                            }
                            AttachmentAttempt::Idle | AttachmentAttempt::Command => {
                                assembly.deadline
                            }
                        };
                        self.attempt = AttachmentAttempt::Stream { deadline };
                        self.assembly = Some(assembly);
                        Vec::new()
                    }
                    Err(_) => self.retry_after_failure(),
                }
            }
            AttachmentRecord::SnapshotChunk {
                snapshot_id,
                index,
                messages,
                ..
            } => {
                let Some(assembly) = self.assembly.as_mut() else {
                    return self.retry_after_failure();
                };
                if assembly.add_chunk(&snapshot_id, index, messages).is_err() {
                    return self.retry_after_failure();
                }
                Vec::new()
            }
            AttachmentRecord::SnapshotEnd {
                snapshot_id,
                chunk_count,
                last_event_sequence,
                last_event_cursor,
                ..
            } => {
                let Some(assembly) = self.assembly.take() else {
                    return self.retry_after_failure();
                };
                match assembly.finish(
                    &snapshot_id,
                    chunk_count,
                    last_event_sequence,
                    last_event_cursor,
                ) {
                    Ok(snapshot) => self.install(snapshot),
                    Err(_) => self.retry_after_failure(),
                }
            }
            AttachmentRecord::SnapshotFailed { .. } => self.retry_after_failure(),
            AttachmentRecord::Detached { .. } => {
                self.terminal = true;
                vec![ReducerEffect::Publish(Arc::new(
                    AttachmentState::Detached {
                        active_session_id: self.target.clone(),
                    },
                ))]
            }
            AttachmentRecord::Closed { reason, .. } => {
                self.terminal = true;
                vec![ReducerEffect::Publish(Arc::new(AttachmentState::Closed {
                    active_session_id: self.target.clone(),
                    reason: reason.into(),
                }))]
            }
        }
    }

    pub(crate) fn install_inline(&mut self, snapshot: ValidatedSnapshot) -> Vec<ReducerEffect> {
        self.install(snapshot)
    }

    pub(crate) fn next_deadline(&self) -> Option<Instant> {
        match self.attempt {
            AttachmentAttempt::Stream { deadline } => Some(deadline),
            AttachmentAttempt::Idle | AttachmentAttempt::Command => None,
        }
    }

    pub(crate) fn expire(&mut self, now: Instant) -> Vec<ReducerEffect> {
        if self.next_deadline().is_some_and(|deadline| deadline <= now) {
            self.retry_after_failure()
        } else {
            Vec::new()
        }
    }

    fn on_cursor(&mut self, cursor: Option<EventCursor>) -> Vec<ReducerEffect> {
        if self.awaiting_snapshot {
            if self.early.len() == MAX_EARLY_EVENTS {
                return self.retry_after_failure();
            }
            self.early.push_back(cursor);
            return Vec::new();
        }
        self.apply_cursor(cursor)
    }

    fn install(&mut self, snapshot: ValidatedSnapshot) -> Vec<ReducerEffect> {
        if snapshot.active_session_id != self.target.as_str() {
            return self.retry_after_failure();
        }
        self.revision = self.revision.saturating_add(1);
        let view = AttachedSession {
            active_session_id: self.target.clone(),
            session_id: SessionId(snapshot.summary.session_id().to_owned()),
            activity: snapshot.summary.activity(),
            working_directory: snapshot.summary.working_directory().clone(),
            snapshot_message_count: snapshot.messages.len(),
            revision: self.revision,
        };
        self.cursor = Some(snapshot.cursor);
        self.view = Some(view.clone());
        self.awaiting_snapshot = false;
        self.attempt = AttachmentAttempt::Idle;
        self.consecutive_resyncs = 0;
        self.assembly = None;
        let mut effects = vec![ReducerEffect::Publish(Arc::new(AttachmentState::Ready(
            view,
        )))];
        while let Some(cursor) = self.early.pop_front() {
            effects.extend(self.apply_cursor(cursor));
            if self.awaiting_snapshot {
                break;
            }
        }
        effects
    }

    fn apply_cursor(&mut self, next: Option<EventCursor>) -> Vec<ReducerEffect> {
        let Some(next) = next else {
            return self.request_resync();
        };
        let Some(current) = self.cursor.as_ref() else {
            return self.request_resync();
        };
        if next.generation == current.generation && next.sequence <= current.sequence {
            return Vec::new();
        }
        if next.generation != current.generation || next.sequence != current.sequence + 1 {
            return self.request_resync();
        }
        self.cursor = Some(next);
        self.revision = self.revision.saturating_add(1);
        if let Some(view) = self.view.as_mut() {
            view.revision = self.revision;
            return vec![ReducerEffect::Publish(Arc::new(AttachmentState::Ready(
                view.clone(),
            )))];
        }
        self.request_resync()
    }

    fn request_resync(&mut self) -> Vec<ReducerEffect> {
        if !matches!(self.attempt, AttachmentAttempt::Idle) {
            return Vec::new();
        }
        self.retry_after_failure()
    }

    fn retry_after_failure(&mut self) -> Vec<ReducerEffect> {
        self.assembly = None;
        self.early.clear();
        self.awaiting_snapshot = true;
        self.attempt = AttachmentAttempt::Idle;
        self.consecutive_resyncs = self.consecutive_resyncs.saturating_add(1);
        if self.consecutive_resyncs > MAX_CONSECUTIVE_RESYNCS {
            return self.make_unavailable(AttachmentError::RecoveryLimit);
        }
        self.attempt = AttachmentAttempt::Command;
        vec![
            ReducerEffect::Publish(Arc::new(AttachmentState::Resyncing {
                active_session_id: self.target.clone(),
            })),
            ReducerEffect::Resync,
        ]
    }
}

struct SnapshotAssembly {
    id: String,
    header: WireSnapshotHeader,
    expected_messages: usize,
    chunks: BTreeMap<usize, Vec<serde_json::Value>>,
    received_bytes: usize,
    deadline: Instant,
}

impl SnapshotAssembly {
    fn new(
        id: String,
        header: WireSnapshotHeader,
        expected_messages: usize,
        target_chunk_bytes: usize,
        now: Instant,
    ) -> Result<Self, ProtocolError> {
        if id.trim().is_empty()
            || expected_messages > MAX_SNAPSHOT_MESSAGES
            || target_chunk_bytes == 0
            || target_chunk_bytes > MAX_SNAPSHOT_BYTES
        {
            return Err(ProtocolError::InvalidField {
                message_type: "session_snapshot_begin",
                field: "shape",
            });
        }
        Ok(Self {
            id,
            header,
            expected_messages,
            chunks: BTreeMap::new(),
            received_bytes: 0,
            deadline: now + SNAPSHOT_TIMEOUT,
        })
    }

    fn add_chunk(
        &mut self,
        id: &str,
        index: usize,
        messages: Vec<serde_json::Value>,
    ) -> Result<(), ProtocolError> {
        if id != self.id || index >= MAX_SNAPSHOT_CHUNKS || self.chunks.contains_key(&index) {
            return Err(ProtocolError::InvalidField {
                message_type: "session_snapshot_chunk",
                field: "identity",
            });
        }
        let bytes = serde_json::to_vec(&messages)
            .map_err(|_| ProtocolError::InvalidResponseData("session_snapshot_chunk"))?
            .len();
        self.received_bytes = self.received_bytes.saturating_add(bytes);
        if self.received_bytes > MAX_SNAPSHOT_BYTES {
            return Err(ProtocolError::FrameTooLarge);
        }
        self.chunks.insert(index, messages);
        Ok(())
    }

    fn finish(
        self,
        id: &str,
        chunk_count: usize,
        last_event_sequence: u64,
        last_event_cursor: Option<EventCursor>,
    ) -> Result<ValidatedSnapshot, ProtocolError> {
        if id != self.id
            || chunk_count != self.chunks.len()
            || chunk_count > MAX_SNAPSHOT_CHUNKS
            || self.chunks.keys().copied().ne(0..chunk_count)
        {
            return Err(ProtocolError::InvalidField {
                message_type: "session_snapshot_end",
                field: "chunkCount",
            });
        }
        let messages = self.chunks.into_values().flatten().collect::<Vec<_>>();
        if messages.len() != self.expected_messages {
            return Err(ProtocolError::InvalidField {
                message_type: "session_snapshot_end",
                field: "messageCount",
            });
        }
        self.header
            .finish(messages, last_event_sequence, last_event_cursor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::parse_outbound;

    fn reducer() -> AttachmentReducer {
        AttachmentReducer::new(ActiveSessionId("active-one".to_owned()))
    }

    fn summary() -> serde_json::Value {
        serde_json::json!({
            "id": "active-one",
            "lifecycle": "live",
            "activity": "idle",
            "activeSessionId": "active-one",
            "sessionId": "session-one",
            "cwd": "/tmp/project",
            "attachedClients": 1,
            "messageCount": 2
        })
    }

    #[test]
    fn early_events_apply_after_the_inline_snapshot() {
        let mut reducer = reducer();
        let event = parse_outbound(
            r#"{"type":"session_event","activeSessionId":"active-one","event":{"type":"idle"},"meta":{"cursor":{"generation":"generation-one","sequence":2}}}"#,
        )
        .expect("event must parse");
        let crate::protocol::Outbound::SessionEvent(event) = event else {
            panic!("attachment event required");
        };
        assert!(reducer.on_record(event, Instant::now()).is_empty());
        let snapshot: crate::protocol::WireSnapshot = serde_json::from_value(serde_json::json!({
            "activeSessionId": "active-one",
            "summary": summary(),
            "state": {},
            "messages": [{}, {}],
            "lastEventSequence": 1,
            "lastEventCursor": {"generation":"generation-one","sequence":1}
        }))
        .expect("snapshot must parse");

        let effects = reducer.install_inline(snapshot.validate().expect("valid snapshot"));

        assert!(matches!(
            effects.last(),
            Some(ReducerEffect::Publish(state))
                if matches!(state.as_ref(), AttachmentState::Ready(view) if view.local_revision() == 2)
        ));
    }

    #[test]
    fn cursor_gap_requests_one_resync() {
        let mut reducer = reducer();
        let snapshot: crate::protocol::WireSnapshot = serde_json::from_value(serde_json::json!({
            "activeSessionId": "active-one",
            "summary": summary(),
            "state": {},
            "messages": [],
            "lastEventSequence": 1,
            "lastEventCursor": {"generation":"generation-one","sequence":1}
        }))
        .expect("snapshot must parse");
        reducer.install_inline(snapshot.validate().expect("valid snapshot"));

        let effects = reducer.on_record(
            AttachmentRecord::Event {
                active_session_id: "active-one".to_owned(),
                event: serde_json::json!({"type":"idle"}),
                cursor: Some(EventCursor {
                    generation: "generation-one".to_owned(),
                    sequence: 3,
                }),
            },
            Instant::now(),
        );

        assert_eq!(
            effects
                .iter()
                .filter(|effect| matches!(effect, ReducerEffect::Resync))
                .count(),
            1
        );
    }

    #[test]
    fn streamed_response_deadline_retries_and_stops_at_the_bound() {
        let mut reducer = reducer();
        let started = Instant::now();
        reducer.start_command_attempt();
        reducer.on_streamed_response(started);

        let first = reducer.expire(started + SNAPSHOT_TIMEOUT);
        assert!(first
            .iter()
            .any(|effect| matches!(effect, ReducerEffect::Resync)));

        for _ in 1..MAX_CONSECUTIVE_RESYNCS {
            let effects = reducer.on_record(
                AttachmentRecord::SnapshotFailed {
                    active_session_id: "active-one".to_owned(),
                },
                started,
            );
            assert!(effects
                .iter()
                .any(|effect| matches!(effect, ReducerEffect::Resync)));
        }
        let terminal = reducer.on_record(
            AttachmentRecord::SnapshotFailed {
                active_session_id: "active-one".to_owned(),
            },
            started,
        );
        assert!(matches!(
            terminal.as_slice(),
            [ReducerEffect::Publish(state)]
                if matches!(state.as_ref(), AttachmentState::Unavailable {
                    error: AttachmentError::RecoveryLimit,
                    ..
                })
        ));
    }

    #[test]
    fn repeated_transport_loss_advances_the_recovery_bound() {
        let mut reducer = reducer();
        for _ in 0..MAX_CONSECUTIVE_RESYNCS {
            reducer.start_command_attempt();
            let effects = reducer.on_transport_lost();
            assert!(matches!(
                effects.as_slice(),
                [ReducerEffect::Publish(state)]
                    if matches!(state.as_ref(), AttachmentState::Resyncing { .. })
            ));
        }
        reducer.start_command_attempt();
        let terminal = reducer.on_transport_lost();
        assert!(matches!(
            terminal.as_slice(),
            [ReducerEffect::Publish(state)]
                if matches!(state.as_ref(), AttachmentState::Unavailable {
                    error: AttachmentError::RecoveryLimit,
                    ..
                })
        ));
    }
}
