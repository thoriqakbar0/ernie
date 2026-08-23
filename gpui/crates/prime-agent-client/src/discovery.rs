use std::ffi::OsString;
use std::path::PathBuf;

use crate::{DaemonEndpoint, EndpointError};

const SOCKET_OVERRIDE: &str = "PRIME_AGENT_DAEMON_SOCKET";

/// The configuration source used for a discovered daemon endpoint.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DaemonEndpointSource {
    /// Ernie's process environment selected an explicit socket.
    EnvironmentOverride,
    /// Prime Agent's user-scoped default socket was selected.
    UserDefault,
}

pub(crate) fn discover() -> Result<(DaemonEndpoint, DaemonEndpointSource), EndpointError> {
    discover_from(
        std::env::var_os(SOCKET_OVERRIDE),
        std::env::temp_dir(),
        rustix::process::getuid().as_raw(),
    )
}

fn discover_from(
    socket_override: Option<OsString>,
    temporary_directory: PathBuf,
    user_id: u32,
) -> Result<(DaemonEndpoint, DaemonEndpointSource), EndpointError> {
    match socket_override {
        Some(path) => Ok((
            DaemonEndpoint::at(PathBuf::from(path))?,
            DaemonEndpointSource::EnvironmentOverride,
        )),
        None => Ok((
            DaemonEndpoint::at(
                temporary_directory
                    .join(format!("prime-agent-{user_id}"))
                    .join("daemon.sock"),
            )?,
            DaemonEndpointSource::UserDefault,
        )),
    }
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;
    use std::path::PathBuf;

    use super::{discover_from, DaemonEndpointSource};
    use crate::EndpointError;

    #[test]
    fn environment_override_takes_precedence() {
        let (endpoint, source) = discover_from(
            Some(OsString::from("/tmp/selected.sock")),
            PathBuf::from("/ignored"),
            501,
        )
        .expect("override must be valid");

        assert_eq!(endpoint.path(), PathBuf::from("/tmp/selected.sock"));
        assert_eq!(source, DaemonEndpointSource::EnvironmentOverride);
    }

    #[test]
    fn default_path_matches_prime_agent_convention() {
        let (endpoint, source) =
            discover_from(None, PathBuf::from("/private/tmp"), 501).expect("default must be valid");

        assert_eq!(
            endpoint.path(),
            PathBuf::from("/private/tmp/prime-agent-501/daemon.sock")
        );
        assert_eq!(source, DaemonEndpointSource::UserDefault);
    }

    #[test]
    fn empty_override_is_rejected() {
        let error = discover_from(Some(OsString::new()), PathBuf::from("/tmp"), 501)
            .expect_err("empty override must fail");

        assert_eq!(error, EndpointError::Empty);
    }
}
