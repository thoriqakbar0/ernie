use std::path::PathBuf;

use prime_agent_client::{
    DaemonClient, DaemonEndpoint, EndpointError, RequestError, SessionActivity, SessionLifecycle,
    SessionList, SessionSummary,
};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct Refresh(u64);

#[derive(Debug, Default)]
pub(crate) struct SessionListModel {
    refresh: Refresh,
    phase: SessionListPhase,
}

#[derive(Debug, Default)]
pub(crate) enum SessionListPhase {
    #[default]
    Loading,
    Ready(Vec<SessionRow>),
    Unavailable(String),
}

#[derive(Debug, Eq, PartialEq)]
pub(crate) struct SessionRow {
    id: String,
    title: String,
    working_directory: PathBuf,
    lifecycle: SessionLifecycle,
    activity: SessionActivity,
    message_count: u64,
}

impl SessionRow {
    pub(crate) fn id(&self) -> &str {
        &self.id
    }

    pub(crate) fn title(&self) -> &str {
        &self.title
    }

    pub(crate) fn working_directory(&self) -> &std::path::Path {
        &self.working_directory
    }

    pub(crate) fn status(&self) -> &'static str {
        match (self.lifecycle, self.activity) {
            (SessionLifecycle::Draft, _) => "Draft",
            (SessionLifecycle::Live, SessionActivity::Working) => "Working",
            (SessionLifecycle::Live, SessionActivity::Idle) => "Idle",
            (SessionLifecycle::Archived, _) => "Archived",
        }
    }

    pub(crate) fn message_count(&self) -> u64 {
        self.message_count
    }
}

impl SessionListModel {
    pub(crate) fn begin_refresh(&mut self) -> Refresh {
        self.refresh.0 = self.refresh.0.saturating_add(1);
        self.phase = SessionListPhase::Loading;
        self.refresh
    }

    pub(crate) fn finish(
        &mut self,
        refresh: Refresh,
        result: Result<Vec<SessionRow>, SessionLoadError>,
    ) -> bool {
        if refresh != self.refresh {
            return false;
        }

        self.phase = match result {
            Ok(rows) => SessionListPhase::Ready(rows),
            Err(error) => SessionListPhase::Unavailable(error.to_string()),
        };
        true
    }

    pub(crate) fn phase(&self) -> &SessionListPhase {
        &self.phase
    }
}

pub(crate) async fn load_session_rows() -> Result<Vec<SessionRow>, SessionLoadError> {
    let (endpoint, _) = DaemonEndpoint::discover()?;
    let client = DaemonClient::connect(endpoint).await?;
    Ok(project_sessions(client.list_sessions().await?))
}

fn project_sessions(sessions: SessionList) -> Vec<SessionRow> {
    sessions
        .into_vec()
        .into_iter()
        .map(SessionRow::from)
        .collect()
}

impl From<SessionSummary> for SessionRow {
    fn from(session: SessionSummary) -> Self {
        let id = session.id().as_str().to_owned();
        let title = session.name().unwrap_or(&id).to_owned();
        Self {
            id,
            title,
            working_directory: session.working_directory().to_owned(),
            lifecycle: session.lifecycle(),
            activity: session.activity(),
            message_count: session.message_count(),
        }
    }
}

#[derive(Debug)]
pub(crate) enum SessionLoadError {
    Endpoint(EndpointError),
    Connect(prime_agent_client::ConnectError),
    Request(RequestError),
}

impl From<EndpointError> for SessionLoadError {
    fn from(error: EndpointError) -> Self {
        Self::Endpoint(error)
    }
}

impl From<prime_agent_client::ConnectError> for SessionLoadError {
    fn from(error: prime_agent_client::ConnectError) -> Self {
        Self::Connect(error)
    }
}

impl From<RequestError> for SessionLoadError {
    fn from(error: RequestError) -> Self {
        Self::Request(error)
    }
}

impl std::fmt::Display for SessionLoadError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Endpoint(error) => error.fmt(formatter),
            Self::Connect(error) => error.fmt(formatter),
            Self::Request(error) => error.fmt(formatter),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{Refresh, SessionListModel, SessionListPhase, SessionLoadError, SessionRow};
    use prime_agent_client::{EndpointError, SessionActivity, SessionLifecycle};

    fn row(id: &str) -> SessionRow {
        SessionRow {
            id: id.to_owned(),
            title: id.to_owned(),
            working_directory: PathBuf::from("/tmp"),
            lifecycle: SessionLifecycle::Live,
            activity: SessionActivity::Idle,
            message_count: 0,
        }
    }

    #[test]
    fn stale_completion_does_not_replace_the_current_refresh() {
        let mut model = SessionListModel::default();
        let stale = model.begin_refresh();
        let current = model.begin_refresh();

        assert!(!model.finish(stale, Err(SessionLoadError::Endpoint(EndpointError::Empty))));
        assert!(matches!(model.phase(), SessionListPhase::Loading));
        assert_eq!(current, Refresh(2));
    }

    #[test]
    fn current_failure_replaces_loading_state() {
        let mut model = SessionListModel::default();
        let refresh = model.begin_refresh();

        assert!(model.finish(
            refresh,
            Err(SessionLoadError::Endpoint(EndpointError::Empty))
        ));
        assert!(matches!(
            model.phase(),
            SessionListPhase::Unavailable(message) if message.contains("must not be empty")
        ));
    }

    #[test]
    fn current_success_replaces_the_complete_snapshot() {
        let mut model = SessionListModel::default();
        let first = model.begin_refresh();
        assert!(model.finish(first, Ok(vec![row("one"), row("two")])));
        let second = model.begin_refresh();

        assert!(model.finish(second, Ok(vec![row("three")])));
        assert!(matches!(
            model.phase(),
            SessionListPhase::Ready(rows) if rows.as_slice() == [row("three")]
        ));
    }
}
