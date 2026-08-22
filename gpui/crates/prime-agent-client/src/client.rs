use std::future::pending;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio::time::{sleep_until, timeout};

use crate::protocol::{parse_session_list, Inbound, ProtocolCore};
use crate::{
    CommandResponse, ConnectError, DaemonCommand, DaemonEndpoint, DaemonEvent, RequestError,
    ServerInfo, SessionList,
};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const HELLO_TIMEOUT: Duration = Duration::from_secs(3);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_FRAME_BYTES: usize = 4 * 1024 * 1024;

/// A connected and protocol-compatible Prime Agent daemon client.
#[derive(Clone)]
pub struct DaemonClient {
    commands: mpsc::Sender<DriverCommand>,
    events: broadcast::Sender<DaemonEvent>,
    server: Arc<ServerInfo>,
}

impl DaemonClient {
    /// Connects to a local daemon and validates `daemon_hello` before returning.
    pub async fn connect(endpoint: DaemonEndpoint) -> Result<Self, ConnectError> {
        let (commands, receiver) = mpsc::channel(32);
        let (events, _) = broadcast::channel(256);
        let (connected_tx, connected_rx) = oneshot::channel();
        std::thread::Builder::new()
            .name("prime-agent-client".to_owned())
            .spawn({
                let events = events.clone();
                move || {
                    let runtime = tokio::runtime::Builder::new_current_thread()
                        .enable_all()
                        .build();
                    match runtime {
                        Ok(runtime) => {
                            runtime.block_on(run_driver(endpoint, receiver, connected_tx, events))
                        }
                        Err(_) => {
                            let _ = connected_tx.send(Err(ConnectError::DriverStopped));
                        }
                    }
                }
            })
            .map_err(|_| ConnectError::DriverStopped)?;
        let server = connected_rx
            .await
            .map_err(|_| ConnectError::DriverStopped)??;
        Ok(Self {
            commands,
            events,
            server: Arc::new(server),
        })
    }

    /// Returns facts accepted from the daemon greeting.
    pub fn server(&self) -> &ServerInfo {
        &self.server
    }

    /// Lists the daemon's resident sessions.
    pub async fn list_sessions(&self) -> Result<SessionList, RequestError> {
        let command = DaemonCommand::new("list").map_err(RequestError::Build)?;
        let response = self.execute(command).await?;
        parse_session_list(response.into_data()).map_err(RequestError::from)
    }

    /// Executes any command in the pinned Prime Agent daemon inventory.
    pub async fn execute(&self, command: DaemonCommand) -> Result<CommandResponse, RequestError> {
        let (reply, result) = oneshot::channel();
        self.commands
            .send(DriverCommand::Execute { command, reply })
            .await
            .map_err(|_| RequestError::ConnectionClosed)?;
        result.await.map_err(|_| RequestError::ConnectionClosed)?
    }

    /// Subscribes to recognized asynchronous daemon records.
    pub fn subscribe(&self) -> broadcast::Receiver<DaemonEvent> {
        self.events.subscribe()
    }
}

enum DriverCommand {
    Execute {
        command: DaemonCommand,
        reply: oneshot::Sender<Result<CommandResponse, RequestError>>,
    },
}

async fn run_driver(
    endpoint: DaemonEndpoint,
    mut commands: mpsc::Receiver<DriverCommand>,
    connected: oneshot::Sender<Result<ServerInfo, ConnectError>>,
    events: broadcast::Sender<DaemonEvent>,
) {
    let stream = match timeout(CONNECT_TIMEOUT, UnixStream::connect(endpoint.path())).await {
        Ok(Ok(stream)) => stream,
        Ok(Err(error)) => {
            let _ = connected.send(Err(ConnectError::Io(error)));
            return;
        }
        Err(_) => {
            let _ = connected.send(Err(ConnectError::TimedOut));
            return;
        }
    };
    let (reader, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let command_client_id = format!("ernie-gpui:{}", std::process::id());
    let mut core = ProtocolCore::new(command_client_id);
    let hello = match timeout(HELLO_TIMEOUT, read_frame(&mut reader)).await {
        Ok(Ok(Some(line))) => core.accept_hello(&line).map_err(ConnectError::from),
        Ok(Ok(None)) => Err(ConnectError::DriverStopped),
        Ok(Err(FrameReadError::Io(error))) => Err(ConnectError::Io(error)),
        Ok(Err(FrameReadError::Protocol(error))) => Err(ConnectError::Protocol(error)),
        Err(_) => Err(ConnectError::TimedOut),
    };
    let server = match hello {
        Ok(server) => server,
        Err(error) => {
            let _ = connected.send(Err(error));
            return;
        }
    };
    if connected.send(Ok(server)).is_err() {
        return;
    }

    loop {
        let next_deadline = core.next_deadline();
        tokio::select! {
            command = commands.recv() => {
                let Some(command) = command else { break };
                match command {
                    DriverCommand::Execute { command, reply } => {
                        let issued = match core.issue(command, reply, Instant::now() + REQUEST_TIMEOUT) {
                            Ok(issued) => issued,
                            Err(error) => {
                                fail_pending_protocol(core, error);
                                return;
                            }
                        };
                        if writer.write_all(&issued.bytes).await.is_err() {
                            if let Some(reply) = core.cancel(&issued.request_id) {
                                let _ = reply.send(Err(RequestError::ConnectionClosed));
                            }
                            fail_pending_connection(core);
                            return;
                        }
                    }
                }
            }
            line = read_frame(&mut reader) => {
                let line = match line {
                    Ok(Some(line)) => line,
                    Ok(None) | Err(FrameReadError::Io(_)) => {
                        fail_pending_connection(core);
                        return;
                    }
                    Err(FrameReadError::Protocol(error)) => {
                        fail_pending_protocol(core, error);
                        return;
                    }
                };
                match core.receive_line(&line) {
                    Ok(Some(Inbound::Completed(completed))) => {
                        let _ = completed.completion.send(completed.result);
                    }
                    Ok(Some(Inbound::Event(event))) => {
                        let _ = events.send(event);
                    }
                    Ok(None) => {}
                    Err(error) => {
                        fail_pending_protocol(core, error);
                        return;
                    }
                }
            }
            _ = wait_for_deadline(next_deadline) => {
                for reply in core.expire(Instant::now()) {
                    let _ = reply.send(Err(RequestError::TimedOut));
                }
            }
        }
    }
    fail_pending_connection(core);
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
    Protocol(crate::ProtocolError),
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
            return Err(FrameReadError::Protocol(
                crate::ProtocolError::FrameTooLarge,
            ));
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
        .map_err(|_| FrameReadError::Protocol(crate::ProtocolError::InvalidUtf8))
}

fn fail_pending_connection(
    core: ProtocolCore<oneshot::Sender<Result<CommandResponse, RequestError>>>,
) {
    for reply in core.drain() {
        let _ = reply.send(Err(RequestError::ConnectionClosed));
    }
}

fn fail_pending_protocol(
    core: ProtocolCore<oneshot::Sender<Result<CommandResponse, RequestError>>>,
    error: crate::ProtocolError,
) {
    for reply in core.drain() {
        let _ = reply.send(Err(RequestError::Protocol(error.clone())));
    }
}

#[cfg(test)]
mod tests {
    use tokio::io::BufReader;

    use super::{read_frame, FrameReadError, MAX_FRAME_BYTES};
    use crate::ProtocolError;

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
}
