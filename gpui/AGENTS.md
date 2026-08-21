# GPUI development rules

Keep the Cordis-shaped runtime and Prime Agent client independent of GPUI. Only the desktop and UI crates may depend on GPUI.

Use Prime Agent's daemon socket protocol for native integration. Do not port or spawn the stdio `RpcClient` unless the user explicitly requests it.

Treat the Prime Agent daemon as the source of truth for session state and lifetime. Ernie attaches to sessions; it does not own them.

Implement the daemon boundary in `prime-agent-client` with these responsibilities:

- Parse `daemon_hello` before sending commands.
- Negotiate and check capabilities before using optional commands or events.
- Correlate every command response by request ID.
- Treat command responses and session events as separate channels.
- Attach with the active session ID and last accepted cursor.
- Replace local state from the authoritative attach or reconnect snapshot.
- Reject stale or duplicate sequenced events.
- Preserve stable mutation envelopes across reconnect when retry is supported.
- Parse every socket message as untrusted boundary input.

Do not assume missed event bodies can be replayed. Recover continuity from a fresh snapshot, then resume live events from its cursor.

Keep daemon protocol changes capability-gated and compatible with older Prime Agent daemons. A missing optional capability must not block startup, attachment, or prompting.

Use `cargo run` for normal development and `cargo run --release` for realistic performance checks. Do not attach a debugger unless debugging requires it.

Run `just check` after Rust code changes. Documentation-only changes require `git diff --check`.
