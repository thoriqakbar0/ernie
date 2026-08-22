use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::fs::FileTypeExt;
use std::os::unix::net::UnixListener;
use std::path::{Path, PathBuf};

use prime_agent_client::{
    DaemonClient, DaemonEndpoint, ProtocolError, RequestError, ServerCapability,
};
use serde_json::Value;

#[derive(Clone, Copy, Debug)]
enum FakeResponse {
    Catalog,
    MismatchedCommand,
    NoResponse,
}

impl FakeResponse {
    fn tag(self) -> &'static str {
        match self {
            Self::Catalog => "catalog",
            Self::MismatchedCommand => "mismatch",
            Self::NoResponse => "no-response",
        }
    }
}

struct FakeDaemon {
    socket_path: PathBuf,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl FakeDaemon {
    fn start(response: FakeResponse) -> Self {
        let directory = std::env::temp_dir().join(format!(
            "ernie-pa-{}-{}",
            std::process::id(),
            response.tag(),
        ));
        fs::create_dir_all(&directory).expect("test directory must exist");
        let socket_path = directory.join("daemon.sock");
        let listener = UnixListener::bind(&socket_path).expect("fake daemon must bind");
        let thread = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("client must connect");
            writeln!(
                stream,
                "{}",
                serde_json::json!({
                    "type": "daemon_hello",
                    "socketPath": "/tmp/fake.sock",
                    "protocol": { "name": "prime-agent.daemon", "version": 7 },
                    "schemaId": "protocol-7-schema-22-4d515169dc6b",
                    "schemaRevision": 22,
                    "clientId": "connection-one",
                    "serverCapabilities": ["attach_snapshot", "future_capability"]
                })
            )
            .expect("greeting must write");
            let mut line = String::new();
            BufReader::new(stream.try_clone().expect("stream must clone"))
                .read_line(&mut line)
                .expect("command must read");
            let request: Value = serde_json::from_str(&line).expect("command must be JSON");
            if matches!(response, FakeResponse::NoResponse) {
                let _ = stream.read_to_end(&mut Vec::new());
                return;
            }
            let id = request["id"].as_str().expect("command must carry id");
            let sessions = if matches!(response, FakeResponse::Catalog) {
                serde_json::json!([{
                    "id": "active-one",
                    "lifecycle": "live",
                    "activity": "idle",
                    "isSessionActive": false,
                    "activeSessionId": "active-one",
                    "sessionId": "session-one",
                    "cwd": "/tmp/project",
                    "isStreaming": false,
                    "isCompacting": false,
                    "attachedClients": 1,
                    "messageCount": 3,
                    "sessionActions": { "version": 1, "actions": [] },
                    "workerState": "ready"
                }])
            } else {
                serde_json::json!([])
            };
            writeln!(
                stream,
                "{}",
                serde_json::json!({
                    "type": "response",
                    "id": id,
                    "command": if matches!(response, FakeResponse::MismatchedCommand) { "attach" } else { "list" },
                    "success": true,
                    "data": { "sessions": sessions }
                })
            )
            .expect("response must write");
        });
        Self {
            socket_path,
            thread: Some(thread),
        }
    }

    fn endpoint(&self) -> DaemonEndpoint {
        DaemonEndpoint::at(&self.socket_path).expect("endpoint must be valid")
    }
}

impl Drop for FakeDaemon {
    fn drop(&mut self) {
        if let Some(thread) = self.thread.take() {
            thread.join().expect("fake daemon must stop");
        }
        if let Some(directory) = self.socket_path.parent() {
            let _ = fs::remove_dir_all(directory);
        }
    }
}

#[tokio::test]
async fn client_validates_hello_and_correlates_list_response() {
    let daemon = FakeDaemon::start(FakeResponse::Catalog);

    let client = DaemonClient::connect(daemon.endpoint())
        .await
        .expect("client must connect");
    let sessions = client.list_sessions().await.expect("list must succeed");

    assert_eq!(client.server().protocol_version(), 7);
    assert!(client.server().supports(ServerCapability::AttachSnapshot));
    assert_eq!(
        client.server().unknown_capabilities().collect::<Vec<_>>(),
        ["future_capability"]
    );
    assert_eq!(
        sessions
            .iter()
            .next()
            .expect("session must exist")
            .id()
            .as_str(),
        "session-one"
    );
}

#[tokio::test]
async fn client_reports_response_mismatch_as_a_protocol_error() {
    let daemon = FakeDaemon::start(FakeResponse::MismatchedCommand);
    let client = DaemonClient::connect(daemon.endpoint())
        .await
        .expect("client must connect");

    let error = client.list_sessions().await.expect_err("list must fail");

    assert!(matches!(
        error,
        RequestError::Protocol(ProtocolError::ResponseCommandMismatch { .. })
    ));
}

#[tokio::test]
async fn client_times_out_when_daemon_does_not_respond() {
    let daemon = FakeDaemon::start(FakeResponse::NoResponse);
    let client = DaemonClient::connect(daemon.endpoint())
        .await
        .expect("client must connect");

    let error = client
        .list_sessions()
        .await
        .expect_err("list must time out");

    assert!(matches!(error, RequestError::TimedOut));
}

#[tokio::test]
#[ignore = "requires PRIME_AGENT_DAEMON_SOCKET to name a live daemon"]
async fn connects_to_live_prime_agent_daemon() {
    let socket_path = std::env::var_os("PRIME_AGENT_DAEMON_SOCKET")
        .map(PathBuf::from)
        .filter(|path| {
            Path::new(path)
                .metadata()
                .is_ok_and(|metadata| metadata.file_type().is_socket())
        })
        .expect("PRIME_AGENT_DAEMON_SOCKET must name a Unix socket");
    let client =
        DaemonClient::connect(DaemonEndpoint::at(socket_path).expect("endpoint must parse"))
            .await
            .expect("live daemon must connect");

    client
        .list_sessions()
        .await
        .expect("live daemon list must succeed");
}
