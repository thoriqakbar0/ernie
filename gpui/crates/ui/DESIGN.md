# Prime Agent session list

## Problem

Ernie must show the sessions owned by the Prime Agent daemon. The daemon remains the source of truth. The Rust client owns socket and protocol details. The GPUI view owns only its current display snapshot.

## Caller view

`RootView::new` starts one session load. The view shows a loading message, the complete returned catalog, an empty message, or a retryable error. Retry starts a new load and rejects any older completion.

## Shape

`DaemonEndpoint::discover` reads `PRIME_AGENT_DAEMON_SOCKET` first. Without the override, it builds Prime Agent's user-scoped path under `std::env::temp_dir()`. Discovery does not inspect or delete the socket. `DaemonClient::connect` validates the peer and its `daemon_hello` message.

`SessionListModel` owns a monotonic refresh value and one `SessionListPhase`. The phase is loading, ready, or unavailable. A successful request replaces the full snapshot. Ernie never merges or mutates daemon sessions.

`RootView` owns the GPUI task. The task performs socket work outside `render`, updates the live entity, and calls `cx.notify()` after an accepted completion.

## Synthesis decision

Three designs were compared. The selected design keeps the state model in `RootView` and discovery in `prime-agent-client`. It has the smallest public surface and does not duplicate Prime Agent domain types.

The design includes two ideas from the other candidates. A successful list replaces the complete snapshot. Discovery avoids a socket preflight that could race the real connection.

The rejected app-wide service added another lifetime for one window. The rejected public source trait duplicated session identity and activity types across the desktop and UI crates.

## Tradeoffs

- The first slice uses a static snapshot and manual retry. Live events need cursor and reconnect design.
- Ernie defines `PRIME_AGENT_DAEMON_SOCKET` as its explicit override contract.
- The UI keeps a private display projection for stable row identity and text.

## Verification

Unit tests cover override precedence, the default path, stale completion rejection, error replacement, and complete snapshot replacement. Runtime verification must launch Ernie against a real daemon socket.
