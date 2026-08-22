use std::cell::RefCell;
use std::fmt;
use std::rc::Rc;

use ernie_plugin_runtime::{
    Context as PluginRuntime, FiberState, LifecycleError, LifecycleReport, PluginId, ServiceKey,
};
use gpui::{
    div, prelude::*, px, rgb, AccessibleAction, Context, FontWeight, KeyDownEvent, Role,
    SharedString, Window,
};

pub struct RootView {
    clicks: ClickCount,
    lifecycle: UiLifecycle,
}

impl RootView {
    pub fn new(_cx: &mut Context<Self>) -> Self {
        Self {
            clicks: ClickCount::default(),
            lifecycle: UiLifecycle::new().expect("built-in UI lifecycle must activate"),
        }
    }
}

impl Render for RootView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let status: SharedString = self.clicks.label().into();
        let lifecycle_status: SharedString = self.lifecycle.status().into();
        let view = cx.entity();

        div()
            .flex()
            .size_full()
            .items_center()
            .justify_center()
            .bg(rgb(0x111318))
            .text_color(rgb(0xf4f5f7))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap_4()
                    .child(
                        div()
                            .text_size(px(30.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("ernie-gpui"),
                    )
                    .child(div().text_color(rgb(0xaeb4bf)).child(lifecycle_status))
                    .child(div().text_color(rgb(0xaeb4bf)).child(status))
                    .child(
                        div()
                            .id("increment")
                            .role(Role::Button)
                            .aria_label("Increment counter")
                            .focusable()
                            .px_5()
                            .py_3()
                            .rounded_lg()
                            .bg(rgb(0x6d5efc))
                            .hover(|style| style.bg(rgb(0x7c70ff)))
                            .active(|style| style.bg(rgb(0x5849df)))
                            .focus(|style| style.border_2().border_color(rgb(0xffffff)))
                            .cursor_pointer()
                            .on_key_down(cx.listener(|view, event: &KeyDownEvent, _, cx| {
                                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                    view.clicks.increment();
                                    cx.notify();
                                }
                            }))
                            .on_a11y_action(AccessibleAction::Click, move |_, _, cx| {
                                view.update(cx, |view, cx| {
                                    view.clicks.increment();
                                    cx.notify();
                                });
                            })
                            .on_click(cx.listener(|view, _, _, cx| {
                                view.clicks.increment();
                                cx.notify();
                            }))
                            .child("Increment"),
                    ),
            )
    }
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

#[derive(Default)]
struct ClickCount(u32);

impl ClickCount {
    fn increment(&mut self) {
        self.0 = self.0.saturating_add(1);
    }

    fn label(&self) -> String {
        match self.0 {
            0 => "Ready".to_owned(),
            1 => "Incremented once".to_owned(),
            count => format!("Incremented {count} times"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{ClickCount, UiLifecycle};

    #[test]
    fn increment_updates_the_visible_label() {
        let mut count = ClickCount::default();

        count.increment();
        count.increment();

        assert_eq!(count.label(), "Incremented 2 times");
    }

    #[test]
    fn built_in_ui_plugin_activates_with_the_application_identity() {
        let lifecycle = UiLifecycle::new().expect("built-in lifecycle must activate");

        assert_eq!(lifecycle.status(), "plugin runtime active for ernie-gpui");
    }
}
