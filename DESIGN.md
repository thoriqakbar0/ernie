# Design

## Direction

Ernie Dev uses a compact, worktree-first developer-workbench composition: a 228 px workspace rail, global surface tabs, a centered conversation, structured activity blocks, and a floating composer.

## Visual System

- Near-black neutral surfaces with low-contrast structural borders.
- Platform sans typography; monospace only for commands, diagnostics, and usage figures.
- Restrained radii and shadows, reserved mainly for the composer and temporary overlays.
- Muted status colors; errors and active work never rely on color alone.
- No redundant E mark, DEV pill, or simulated native branding.

## Composition

- The rail contains repository worktrees, their root/child agents, execution target, connection state, and the persistent worktree-manager entry point.
- Global tabs may open agents from different worktrees. Closing one detaches the view; it does not terminate work.
- Conversation width is capped at 730 px for readable prose.
- Tool calls and delegations are collapsible records with explicit lifecycle states.
- The composer floats within the transcript measure and swaps Send for Stop while streaming.

## Interaction

- Enter sends; Shift+Enter inserts a newline; IME composition is preserved.
- Assistant deltas append to a stable active message.
- Tool updates replace the matching call by call ID.
- Prime Agent startup follows one staged storyboard across the rail and composer: glyph resolution, copy entrance, then ambient progress. The soft glass and aurora treatment takes cues from Dia without copying its chrome.
- Assistant text is keyed by RPC message and content-block identity, coalesced once per animation frame, and reconciled against the authoritative completed message.
- Auto-follow is instant only while pinned to the tail. Scrolling upward releases it and exposes an explicit “Jump to latest” control.
- Reduced-motion preference removes decorative animation.
- New thread clears the visible transcript only after an authoritative non-cancelled RPC response.

## Responsive and Accessibility Rules

- Preserve the rail at 820 px while hiding lower-priority toolbar metadata.
- Every control has a semantic button/textarea role, accessible label where the visible label is insufficient, keyboard activation, and visible focus treatment.
- Text wraps without horizontal transcript overflow.
- Popups and the composer must remain usable at the minimum window size.

## Security-Shaped Design

The renderer has no Node integration, generic IPC, webview, shell, or filesystem access. Content Security Policy permits application resources only. Navigation, popups, permissions, and downloads are denied in main. These are product guarantees rather than invisible implementation details.
