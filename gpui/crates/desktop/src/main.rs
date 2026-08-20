use ernie_gpui_ui::RootView;
use gpui::{
    actions, prelude::*, px, size, App, Bounds, KeyBinding, Menu, MenuItem, QuitMode,
    TitlebarOptions, WindowBackgroundAppearance, WindowBounds, WindowOptions,
};
use gpui_platform::application;

actions!(ernie_gpui, [Quit]);

fn main() {
    application()
        .with_quit_mode(QuitMode::LastWindowClosed)
        .run(|cx: &mut App| {
            cx.on_action(|_: &Quit, cx| cx.quit());
            cx.bind_keys([
                KeyBinding::new("cmd-q", Quit, None),
                KeyBinding::new("ctrl-q", Quit, None),
            ]);
            cx.set_menus([
                Menu::new("ernie-gpui").items([MenuItem::action("Quit ernie-gpui", Quit)])
            ]);

            open_main_window(cx);
            cx.activate(true);
        });
}

fn open_main_window(cx: &mut App) {
    let bounds = Bounds::centered(None, size(px(960.), px(640.)), cx);

    cx.open_window(
        WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(bounds)),
            window_min_size: Some(size(px(640.), px(420.))),
            window_background: WindowBackgroundAppearance::Opaque,
            app_id: Some("com.thoriq.ernie-gpui".into()),
            titlebar: Some(TitlebarOptions {
                title: Some("ernie-gpui".into()),
                ..Default::default()
            }),
            ..Default::default()
        },
        |_window, cx| cx.new(RootView::new),
    )
    .expect("failed to open the ernie-gpui window");
}
