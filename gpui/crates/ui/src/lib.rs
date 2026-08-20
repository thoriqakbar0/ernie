use gpui::{
    div, prelude::*, px, rgb, AccessibleAction, Context, FontWeight, KeyDownEvent, Role,
    SharedString, Window,
};

#[derive(Default)]
pub struct RootView {
    clicks: ClickCount,
}

impl RootView {
    pub fn new(_cx: &mut Context<Self>) -> Self {
        Self::default()
    }
}

impl Render for RootView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let status: SharedString = self.clicks.label().into();
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
                            .child("GPUI app"),
                    )
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
    use super::ClickCount;

    #[test]
    fn increment_updates_the_visible_label() {
        let mut count = ClickCount::default();

        count.increment();
        count.increment();

        assert_eq!(count.label(), "Incremented 2 times");
    }
}
