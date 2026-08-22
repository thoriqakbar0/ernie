use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use tokio::sync::{mpsc, oneshot};
use tokio::time::timeout;

use crate::protocol::ProtocolCore;
use crate::{ConnectError, DaemonEndpoint, RequestError, ServerInfo, SessionList};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const HELLO_TIMEOUT: Duration = Duration::from_secs(3);

/// A connected and protocol-compatible Prime Agent daemon client.
#[derive(Clone)]
pub struct DaemonClient {
    commands: mpsc::Sender<DriverCommand>,
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

    /// Returns facts accepted from the daemon greeting.
    pub fn server(&self) -> &ServerInfo {
        &self.server
    }

    /// Lists the daemon's resident sessions.
    pub async fn list_sessions(&self) -> Result<SessionList, RequestError> {
        let (reply, result) = oneshot::channel();
        self.commands
            .send(DriverCommand::List { reply })
            .await
            .map_err(|_| RequestError::ConnectionClosed)?;
        result.await.map_err(|_| RequestError::ConnectionClosed)?
    }
}

enum DriverCommand {
    List {
        reply: oneshot::Sender<Result<SessionList, RequestError>>,
    },
}

async fn run_driver(
    endpoint: DaemonEndpoint,
    mut commands: mpsc::Receiver<DriverCommand>,
    connected: oneshot::Sender<Result<ServerInfo, ConnectError>>,
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
    let mut lines = BufReader::new(reader).lines();
    let command_client_id = format!("ernie-gpui:{}", std::process::id());
    let mut core = ProtocolCore::new(command_client_id);
    let hello = match timeout(HELLO_TIMEOUT, lines.next_line()).await {
        Ok(Ok(Some(line))) => core.accept_hello(&line).map_err(ConnectError::from),
        Ok(Ok(None)) => Err(ConnectError::DriverStopped),
        Ok(Err(error)) => Err(ConnectError::Io(error)),
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
        tokio::select! {
            command = commands.recv() => {
                let Some(command) = command else { break };
                match command {
                    DriverCommand::List { reply } => {
                        let issued = match core.issue_list(reply) {
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
            line = lines.next_line() => {
                let line = match line {
                    Ok(Some(line)) => line,
                    Ok(None) | Err(_) => {
                        fail_pending_connection(core);
                        return;
                    }
                };
                match core.receive_line(&line) {
                    Ok(Some(completed)) => {
                        let _ = completed.completion.send(completed.result);
                    }
                    Ok(None) => {}
                    Err(error) => {
                        fail_pending_protocol(core, error);
                        return;
                    }
                }
            }
        }
    }
    fail_pending_connection(core);
}

fn fail_pending_connection(core: ProtocolCore<oneshot::Sender<Result<SessionList, RequestError>>>) {
    for reply in core.drain() {
        let _ = reply.send(Err(RequestError::ConnectionClosed));
    }
}

fn fail_pending_protocol(
    core: ProtocolCore<oneshot::Sender<Result<SessionList, RequestError>>>,
    error: crate::ProtocolError,
) {
    for reply in core.drain() {
        let _ = reply.send(Err(RequestError::Protocol(error.clone())));
    }
}
