use std::cell::RefCell;
use std::fmt;
use std::rc::Rc;
use std::sync::Arc;

mod sessions;

use ernie_plugin_runtime::{
    Context as PluginRuntime, FiberState, LifecycleError, LifecycleReport, PluginId, ServiceKey,
};
use gpui::{
    div, prelude::*, px, rgb, AccessibleAction, AnyElement, Context, FontWeight, KeyDownEvent,
    Role, SharedString, Task, Window,
};
use prime_agent_client::{ActiveSessionId, AttachmentError, AttachmentState, DaemonClient};
use sessions::{
    load_session_rows, SessionListModel, SessionListPhase, SessionRow, SessionSelectionModel,
};

pub struct RootView {
    lifecycle: UiLifecycle,
    sessions: SessionListModel,
    session_task: Option<Task<()>>,
    prime_agent: Option<DaemonClient>,
    selection: SessionSelectionModel,
    attachment_task: Option<Task<()>>,
}

impl RootView {
    pub fn new(cx: &mut Context<Self>) -> Self {
        let mut view = Self {
            lifecycle: UiLifecycle::new().expect("built-in UI lifecycle must activate"),
            sessions: SessionListModel::default(),
            session_task: None,
            prime_agent: None,
            selection: SessionSelectionModel::default(),
            attachment_task: None,
        };
        view.refresh_sessions(cx);
        view
    }

    fn refresh_sessions(&mut self, cx: &mut Context<Self>) {
        let refresh = self.sessions.begin_refresh();
        let client = self.prime_agent.clone();
        self.session_task = Some(cx.spawn(async move |view, cx| {
            let result = load_session_rows(client).await;
            let _ = view.update(cx, |view, cx| {
                let result = match result {
                    Ok(load) => {
                        view.prime_agent = Some(load.client);
                        Ok(load.rows)
                    }
                    Err(error) => Err(error),
                };
                if view.sessions.finish(refresh, result) {
                    cx.notify();
                }
            });
        }));
        cx.notify();
    }

    fn select_session(&mut self, active_session_id: ActiveSessionId, cx: &mut Context<Self>) {
        let Some(client) = self.prime_agent.clone() else {
            return;
        };
        let selection = self.selection.begin(active_session_id.clone());
        self.attachment_task = Some(cx.spawn(async move |view, cx| {
            match client.attach_session(active_session_id.clone()).await {
                Ok(attachment) => {
                    let mut updates = attachment.subscribe();
                    loop {
                        let state = updates.borrow_and_update().clone();
                        let applied = view
                            .update(cx, |view, cx| {
                                if view.selection.apply(selection, state) {
                                    cx.notify();
                                }
                            })
                            .is_ok();
                        if !applied || updates.changed().await.is_err() {
                            break;
                        }
                    }
                }
                Err(error) => {
                    let state = Arc::new(AttachmentState::Unavailable {
                        active_session_id,
                        error: AttachmentError::Request(error),
                    });
                    let _ = view.update(cx, |view, cx| {
                        if view.selection.apply(selection, state) {
                            cx.notify();
                        }
                    });
                }
            }
        }));
        cx.notify();
    }

    fn render_session_state(&self, cx: &mut Context<Self>) -> AnyElement {
        match self.sessions.phase() {
            SessionListPhase::Loading => div()
                .text_color(rgb(0xaeb4bf))
                .child("Connecting to Prime Agent…")
                .into_any_element(),
            SessionListPhase::Ready(rows) if rows.is_empty() => div()
                .text_color(rgb(0xaeb4bf))
                .child("No Prime Agent sessions yet.")
                .into_any_element(),
            SessionListPhase::Ready(rows) => {
                let elements = rows
                    .iter()
                    .map(|row| {
                        let status = row.active_id().and_then(|active_id| {
                            self.selection
                                .is_selected(active_id)
                                .then(|| self.selection.status())
                                .flatten()
                        });
                        render_session_row(row, status, cx)
                    })
                    .collect::<Vec<_>>();
                div()
                    .flex()
                    .flex_col()
                    .gap_3()
                    .children(elements)
                    .into_any_element()
            }
            SessionListPhase::Unavailable(message) => {
                let view = cx.entity();
                div()
                    .flex()
                    .flex_col()
                    .items_start()
                    .gap_3()
                    .child(div().text_color(rgb(0xffa0a0)).child(message.clone()))
                    .child(
                        div()
                            .id("retry-prime-agent")
                            .role(Role::Button)
                            .aria_label("Retry Prime Agent connection")
                            .focusable()
                            .px_4()
                            .py_2()
                            .rounded_lg()
                            .bg(rgb(0x6d5efc))
                            .hover(|style| style.bg(rgb(0x7c70ff)))
                            .active(|style| style.bg(rgb(0x5849df)))
                            .focus(|style| style.border_2().border_color(rgb(0xffffff)))
                            .cursor_pointer()
                            .on_key_down(cx.listener(|view, event: &KeyDownEvent, _, cx| {
                                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                    view.refresh_sessions(cx);
                                }
                            }))
                            .on_a11y_action(AccessibleAction::Click, move |_, _, cx| {
                                view.update(cx, |view, cx| view.refresh_sessions(cx));
                            })
                            .on_click(cx.listener(|view, _, _, cx| view.refresh_sessions(cx)))
                            .child("Retry"),
                    )
                    .into_any_element()
            }
        }
    }
}

impl Render for RootView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let lifecycle_status: SharedString = self.lifecycle.status().into();

        div()
            .flex()
            .size_full()
            .justify_center()
            .bg(rgb(0x111318))
            .text_color(rgb(0xf4f5f7))
            .p_8()
            .child(
                div()
                    .flex()
                    .flex_col()
                    .w_full()
                    .max_w(px(720.))
                    .gap_4()
                    .child(
                        div()
                            .text_size(px(30.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("ernie-gpui"),
                    )
                    .child(div().text_color(rgb(0xaeb4bf)).child(lifecycle_status))
                    .child(div().text_size(px(20.)).child("Prime Agent sessions"))
                    .child(self.render_session_state(cx)),
            )
    }
}

fn render_session_row(
    row: &SessionRow,
    attachment_status: Option<&'static str>,
    cx: &mut Context<RootView>,
) -> AnyElement {
    let mut detail = format!(
        "{} · {} · {} messages",
        row.status(),
        row.working_directory().display(),
        row.message_count()
    );
    if let Some(status) = attachment_status {
        detail.push_str(" · ");
        detail.push_str(status);
    }
    let mut element = div()
        .id(format!("prime-agent-session-{}", row.id()))
        .flex()
        .flex_col()
        .gap_1()
        .p_4()
        .rounded_lg()
        .bg(if attachment_status.is_some() {
            rgb(0x25213d)
        } else {
            rgb(0x1a1d24)
        })
        .child(
            div()
                .font_weight(FontWeight::SEMIBOLD)
                .child(row.title().to_owned()),
        )
        .child(div().text_color(rgb(0xaeb4bf)).child(detail));
    if let Some(active_session_id) = row.active_id().cloned() {
        element = element
            .role(Role::Button)
            .aria_label(format!("Attach to {}", row.title()))
            .focusable()
            .cursor_pointer()
            .hover(|style| style.bg(rgb(0x242834)))
            .on_key_down(cx.listener({
                let active_session_id = active_session_id.clone();
                move |view, event: &KeyDownEvent, _, cx| {
                    if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                        view.select_session(active_session_id.clone(), cx);
                    }
                }
            }))
            .on_click(cx.listener(move |view, _, _, cx| {
                view.select_session(active_session_id.clone(), cx);
            }));
    }
    element.into_any_element()
}

const APPLICATION_IDENTITY: ServiceKey<&str> = ServiceKey::new("ernie.application.identity");

struct UiLifecycle {
    _runtime: PluginRuntime,
    status: Rc<RefCell<String>>,
}

impl UiLifecycle {
    fn new() -> Result<Self, UiLifecycleError> {
        let status = Rc::new(RefCell::new("plugin runtime waiting".to_owned()));
        let observed_status = Rc::clone(&status);
        let plugin = PluginId::new("ernie.ui.status");
        let mut runtime = PluginRuntime::new();

        let report = runtime.install(plugin.clone(), [APPLICATION_IDENTITY.id()], move |cx| {
            let application = cx.service(APPLICATION_IDENTITY)?;
            *observed_status.borrow_mut() = format!("plugin runtime active for {}", *application);

            let cleanup_status = Rc::clone(&observed_status);
            cx.acquire((), move || {
                *cleanup_status.borrow_mut() = "plugin runtime waiting".to_owned();
                Ok(())
            });
            Ok(())
        })?;
        Self::require_clean(report)?;

        let report = runtime.provide(APPLICATION_IDENTITY, "ernie-gpui")?;
        Self::require_clean(report)?;

        let state = runtime.state(&plugin);
        if state != Some(FiberState::Active) {
            return Err(UiLifecycleError::UnexpectedState(state));
        }

        Ok(Self {
            _runtime: runtime,
            status,
        })
    }

    fn status(&self) -> String {
        self.status.borrow().clone()
    }

    fn require_clean(report: LifecycleReport) -> Result<(), UiLifecycleError> {
        if report == LifecycleReport::default() {
            Ok(())
        } else {
            Err(UiLifecycleError::Reconciliation(report))
        }
    }
}

#[derive(Debug)]
enum UiLifecycleError {
    Lifecycle(LifecycleError),
    Reconciliation(LifecycleReport),
    UnexpectedState(Option<FiberState>),
}

impl From<LifecycleError> for UiLifecycleError {
    fn from(error: LifecycleError) -> Self {
        Self::Lifecycle(error)
    }
}

impl fmt::Display for UiLifecycleError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Lifecycle(error) => write!(formatter, "lifecycle boundary failed: {error}"),
            Self::Reconciliation(report) => write!(
                formatter,
                "lifecycle reconciliation reported {} activation and {} cleanup failures",
                report.activations.len(),
                report.cleanups.len()
            ),
            Self::UnexpectedState(state) => {
                write!(formatter, "built-in UI plugin entered {state:?}")
            }
        }
    }
}

impl std::error::Error for UiLifecycleError {}

#[cfg(test)]
mod tests {
    use super::UiLifecycle;

    #[test]
    fn built_in_ui_plugin_activates_with_the_application_identity() {
        let lifecycle = UiLifecycle::new().expect("built-in lifecycle must activate");

        assert_eq!(lifecycle.status(), "plugin runtime active for ernie-gpui");
    }
}
