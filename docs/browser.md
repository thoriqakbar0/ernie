# Embedded browser

Open Browser above the workspace to browse beside your conversation in the desktop app. Enter a website or local preview address, then choose Open tab. Each tab has back, forward, reload, and address controls.

Closing the panel hides its tabs. Closing a tab destroys that page. Tabs survive conversation and settings navigation during the application lifetime; restarting Ernie clears the tab list. Website storage uses a separate persistent Electron partition within the current Ernie profile.

Browser development shows a desktop-only explanation. It does not substitute an iframe that fails on sites with embedding restrictions.

## Ownership

`BrowserWorkspace` owns tab selection and panel visibility. `BrowserTab` owns one Electron guest and its navigation events. `BrowserService` enforces guest preferences before attachment. Shared address validation permits HTTP and HTTPS without embedded credentials. Address edits survive loading events until submitted. Guest attachment enables Stop and Go before document completion.

The main-window activation path preserves browser preferences when reopening from the macOS Dock. Service reloads remove old navigation listeners and apply current policy to surviving guests.

Guest pages have no Ernie preload, Node integration, nested webviews, or application RPC bridge. Context isolation, Chromium sandboxing, and web security remain enabled. Permissions and popup windows are denied in this first version. Some authentication flows therefore need a later permission and popup design.

## T3 Code reference

The implementation follows T3 Code's renderer-hosted Electron webview pattern and separate browser partition. The reference snapshot is `pingdotgg/t3code` at `fe07ffe7c0bf1858ba4d1cd1ce0a67b10802a747`:

- [Webview preferences](https://github.com/pingdotgg/t3code/blob/fe07ffe7c0bf1858ba4d1cd1ce0a67b10802a747/apps/desktop/src/preview/WebviewPreferences.ts)
- [Browser sessions](https://github.com/pingdotgg/t3code/blob/fe07ffe7c0bf1858ba4d1cd1ce0a67b10802a747/apps/desktop/src/preview/BrowserSession.ts)
- [Preview IPC](https://github.com/pingdotgg/t3code/blob/fe07ffe7c0bf1858ba4d1cd1ce0a67b10802a747/apps/desktop/src/ipc/methods/preview.ts)

Ernie uses an independent implementation adapted to Zenbu. It retains context isolation because this version has no page-picker preload. It does not copy T3 Code's permission allowlist.

## Remaining integration

Prime Agent browser tools, screenshots, page annotations, popup handling, and restored tab lists are not implemented. Browser tabs are shared across the application window rather than bound to a native agent session.

Native verification must cover navigation, failed loading, tab closure, panel reopening, keyboard focus, and isolation from Ernie APIs. It requires an explicitly requested Electron run. Static type checking cannot prove guest attachment or native layout.
