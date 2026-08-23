use gpui::{div, prelude::*, px, rgb, AnyElement, App, RenderOnce, Window};

#[derive(IntoElement)]
pub(super) struct WorkspaceShell {
    sidebar: AnyElement,
    header_action: AnyElement,
}

impl WorkspaceShell {
    pub(super) fn new(sidebar: AnyElement, header_action: AnyElement) -> Self {
        Self {
            sidebar,
            header_action,
        }
    }

    fn render_article() -> impl IntoElement {
        div()
            .w_full()
            .max_w(px(720.))
            .mx_auto()
            .px_8()
            .py_10()
            .flex()
            .flex_col()
            .gap_6()
            .child(
                div()
                    .text_size(px(30.))
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .child("A focused workspace for Prime Agent"),
            )
            .child(
                div()
                    .text_size(px(16.))
                    .line_height(px(26.))
                    .text_color(rgb(0xb8bfca))
                    .child(
                        "Ernie brings the work around a Prime Agent session into one quiet place. Select a session in the sidebar to follow its live state while you read.",
                    ),
            )
            .child(Self::article_section(
                "Sessions stay authoritative",
                "Each session carries its own work, status, and history. Choose the one you need, then return here whenever you want a clear view of what is happening.",
            ))
            .child(Self::article_section(
                "Attachment updates remain current",
                "The sidebar shows when a session is working, idle, or attached. Its message count changes as the session changes, so the surrounding context stays easy to scan.",
            ))
            .child(Self::article_section(
                "Reading has room to breathe",
                "Longer notes need a calmer pace. This column keeps a comfortable reading width, while the session list remains close when you need to move between tasks.",
            ))
            .child(Self::article_section(
                "Next steps belong to a real interaction model",
                "A conversation has room for preparation as well as response. Keep the task in view, follow the session, and decide the next move with the whole picture nearby.",
            ))
    }

    fn article_section(title: &'static str, body: &'static str) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .gap_2()
            .child(
                div()
                    .text_size(px(18.))
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .child(title),
            )
            .child(
                div()
                    .text_size(px(16.))
                    .line_height(px(26.))
                    .text_color(rgb(0xb8bfca))
                    .child(body),
            )
    }

    fn render_composer() -> impl IntoElement {
        div()
            .flex_none()
            .border_t_1()
            .border_color(rgb(0x303641))
            .bg(rgb(0x171b22))
            .px_6()
            .py_4()
            .child(
                div()
                    .h(px(48.))
                    .rounded_lg()
                    .border_1()
                    .border_color(rgb(0x3b414d))
                    .bg(rgb(0x202631))
                    .px_4()
                    .flex()
                    .items_center()
                    .text_color(rgb(0x8f96a3)),
            )
    }
}

impl RenderOnce for WorkspaceShell {
    fn render(self, _window: &mut Window, _cx: &mut App) -> impl IntoElement {
        div()
            .flex()
            .size_full()
            .overflow_hidden()
            .bg(rgb(0x111318))
            .text_color(rgb(0xf4f5f7))
            .child(
                div()
                    .flex_none()
                    .w(px(280.))
                    .min_h_0()
                    .border_r_1()
                    .border_color(rgb(0x303641))
                    .bg(rgb(0x171b22))
                    .child(
                        div()
                            .id("workspace-sidebar-scroll")
                            .h_full()
                            .overflow_y_scroll()
                            .p_5()
                            .child(self.sidebar),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .flex_1()
                    .min_w_0()
                    .min_h_0()
                    .child(
                        div()
                            .flex()
                            .flex_none()
                            .h(px(64.))
                            .items_center()
                            .justify_between()
                            .border_b_1()
                            .border_color(rgb(0x303641))
                            .bg(rgb(0x171b22))
                            .px_6()
                            .child(
                                div()
                                    .text_size(px(15.))
                                    .font_weight(gpui::FontWeight::SEMIBOLD)
                                    .child("Workspace"),
                            )
                            .child(self.header_action),
                    )
                    .child(
                        div()
                            .id("workspace-article-scroll")
                            .flex_1()
                            .min_h_0()
                            .overflow_y_scroll()
                            .child(Self::render_article()),
                    )
                    .child(Self::render_composer()),
            )
    }
}
