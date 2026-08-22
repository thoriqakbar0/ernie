use std::cell::RefCell;
use std::fmt;
use std::rc::Rc;

mod sessions;

use ernie_plugin_runtime::{
    Context as PluginRuntime, FiberState, LifecycleError, LifecycleReport, PluginId, ServiceKey,
};
use gpui::{
    div, prelude::*, px, rgb, AccessibleAction, AnyElement, Context, FontWeight, KeyDownEvent,
    Role, SharedString, Task, Window,
};
use sessions::{load_session_rows, SessionListModel, SessionListPhase, SessionRow};

pub struct RootView {
    lifecycle: UiLifecycle,
    sessions: SessionListModel,
    session_task: Option<Task<()>>,
}

impl RootView {
    pub fn new(cx: &mut Context<Self>) -> Self {
        let mut view = Self {
            lifecycle: UiLifecycle::new().expect("built-in UI lifecycle must activate"),
            sessions: SessionListModel::default(),
            session_task: None,
        };
        view.refresh_sessions(cx);
        view
    }

    fn refresh_sessions(&mut self, cx: &mut Context<Self>) {
        let refresh = self.sessions.begin_refresh();
        self.session_task = Some(cx.spawn(async move |view, cx| {
            let result = load_session_rows().await;
            let _ = view.update(cx, |view, cx| {
                if view.sessions.finish(refresh, result) {
                    cx.notify();
                }
            });
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
            SessionListPhase::Ready(rows) => div()
                .flex()
                .flex_col()
                .gap_3()
                .children(rows.iter().map(render_session_row))
                .into_any_element(),
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

fn render_session_row(row: &SessionRow) -> AnyElement {
    let detail = format!(
        "{} · {} · {} messages",
        row.status(),
        row.working_directory().display(),
        row.message_count()
    );
    div()
        .id(format!("prime-agent-session-{}", row.id()))
        .flex()
        .flex_col()
        .gap_1()
        .p_4()
        .rounded_lg()
        .bg(rgb(0x1a1d24))
        .child(
            div()
                .font_weight(FontWeight::SEMIBOLD)
                .child(row.title().to_owned()),
        )
        .child(div().text_color(rgb(0xaeb4bf)).child(detail))
        .into_any_element()
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
