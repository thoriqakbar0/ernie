# UI guidance

Each Agent represents one native Prime Agent root. [ADR 0002](adr/0002-native-agent-roots.md) owns that model; [workflow](workflow.md) describes verification. These are interaction requirements, not a claim that all cases pass.

## Visual direction

Use warm paper surfaces, dark ink, restrained orange accents, and existing character artwork. Start directly with content; never add eyebrow labels. Keep decoration quiet in active transcripts.

Use [theme tokens](../src/renderer/theme.stylex.ts), colocated styles, and shared controls. Keep exact dimensions, font sizes, breakpoints, and animation timings in source, not duplicated here. [The StyleX map](../lat.md/styling.md) identifies those boundaries.

Use readable text, accessible speaker attribution, and restrained inline code treatment. Tool code and output preserve whitespace in named, keyboard-scrollable regions. Validate Python source and pair it with output by tool-call ID. Tool completion is distinct from task success.

## Agent roster

Selecting an Agent opens its bound root. The header shows identity and settings; ordinary navigation has no New conversation or reassignment action. Legacy profiles with several sessions need an explicit root choice. Preserve their session files without restoring the removed Saved sessions footer.

The sidebar currently shows live roots and drafts working on their first message. Idle live conversations remain visible. Filtering never deletes Agent records. The accessibility of excluded Agents is an [open finding](verification.md#open-interface-findings).

Favorites precede other Agents in stable creation order. Sidebar rows show Agent names without subagent counts. Group portraits keep children close to the parent and represent all available direct children.

Generated avatar seeds persist across navigation and reload. More faces retains the selection and replaces alternatives. Original artwork keeps its identity. Cosmetic blinking or movement never indicates execution; reduced motion preserves the static character and state text.

## Creation and settings

Add Agent and the unselected empty workspace share the welcome composer. Generated name and avatar are ready to edit; randomizing a name preserves the avatar and offers Undo. Customize and Refine reveal one section at a time. The purpose becomes native instructions.

The folder capsule shows the current directory and offers up to eight known folders plus the native chooser; cancel preserves the form. Failed creation retains input and retry identity. The creation model picker uses the selected session’s live catalog when available, otherwise shows Default model and explains that models require a conversation. Model selection edits only the new Agent draft; runtime model controls remain available in the conversation.

Existing settings open below the composer. The save action stays disabled until values differ from the opened form; unsaved and saving feedback sits beside it. Accepted saves close the form and announce success, while rejected saves retain edits for retry. Folder settings show the full path.

Closing restores the actual opener's focus and preserves the draft. Once prepared, root instructions and folder are read-only until a reset workflow is designed. Changing a tab must not shift the empty-state greeting or composer. Panels may animate with a reduced-motion alternative.

## Message-to-work flow

Keep selection, transcript, composer context, and runtime state aligned. Drafts and reading positions survive navigation for the application lifetime; browser reload clears them.

Enter sends, Shift+Enter inserts a newline, and input-method composition never sends. Reject blank submissions. Keep typing available during attachment, sending, and disconnection; command availability follows authoritative state.

Show creation, admission, queued, stopping, and error feedback beside its action. Acknowledgement confirms admission, not completion. Active-work messages become follow-ups; Stop is a separate action and settles on authoritative state. Preserve newer draft edits when delayed responses arrive.

An uncertain send is never automatically repeated. Check send inspects the original receipt even while disconnected. Explain remaining uncertainty and require an explicit resend decision. See [receipt rules](data-structures.md#send-receipts-and-recovery).

Conversations with messages omit settings shortcuts and subagent disclosures below the composer. Header settings remains available for empty and active conversations. Child inspection preserves the parent's draft and reading context, uses validated native identity, and never starts a replacement session. Unavailable children show a recoverable error.

## Pickers and accessibility

Model and effort controls show accepted values, pending changes, and rejection. Missing effort displays Default. Empty filters offer recovery and restore useful focus. Escape closes pickers and returns focus to their trigger.

The development workspace picker opens an existing conversation; it does not change its execution directory. Show full paths, preserve search on failure, prevent overlapping selections, and close after success.

At narrow widths, roster and chat occupy separate views. Selecting an Agent opens chat; Open sidebar returns to navigation. Keep primary flows usable at 320 CSS pixels and 200% zoom. Wrap long content or expose its full value accessibly when truncated.

Command-B toggles the sidebar. Its controls expose the shortcut, and closing a focused sidebar moves focus to its reopen button.

Use semantic controls, accessible names, visible focus, non-color state cues, and restrained live announcements. Respect reduced motion and forced colors. Earlier transcript readers retain their position and a jump-to-latest action; readers at the end follow output.

Execution disclosure shows authoritative Working, recovery, failure, or disconnected state; settled responses show Response complete only for a final assistant stop reason of stop, with separate stopped/error/length labels and Ready as the unknown fallback. The moving line indicates activity only, never percentage completion; reduced motion keeps it static. Tool counts describe recorded runs, not task success. Successful send acknowledgements and generic queue guidance stay out of the composer footer; pending sends, actual queued receipts, and recovery remain visible.

Tool runs use a horizontal marker strip. Hovering or selecting a marker reveals one run’s code and output; arrow keys, Home, and End move selection. The collapsed activity disclosure mounts no detail content, and expanded activity mounts only the selected run’s output. Failed runs have a distinct marker height and accessible status. Hover state is isolated in the run inspector and unchanged markers are memoized. Preview changes use a brief transform/opacity reveal, disabled with reduced motion.

Subagent activity offers native roster previews inside the conversation activity panel. Parent links inspect an available parent entry; Back to conversation closes the preview and restores the opener’s focus. Reply previews and recaps retain their source labels. Disconnected or unavailable rosters show last known state. These previews do not attach, resume, cancel, or replace sessions.

## Response feedback

Select text within an assistant response, then choose Comment on selection. Add several comments and review or remove them above the composer before sending. Feedback includes the exact excerpt, Agent name, and message identifier. Excerpts are quoted source data in the next user message.

Text and feedback share the session-scoped, versioned draft. Failed or uncertain sends retain both; accepted sends clear only the captured version. Drafts survive conversation changes for the application lifetime.

Saved Agents reconnect automatically when their workspace opens without an attached session. The workspace waits for an existing selection request before restoring the same root. Failed restoration keeps the saved root and offers an explicit retry.

## Application settings and history

Settings and App history are separate pages inside the application shell. Conversation state remains mounted when navigating between these pages. Checkpoint review requests approval in the independent host recovery window. See [App history](app-history.md) for the capture boundary and restoration behavior.

### Theme preference

Settings offers ten palettes, defaulting to Black & white, with System, Light, and Dark modes in the Appearance tab. Changes apply immediately and persist in local browser or app storage. Failed saves keep the current appearance and offer retry by selecting a mode. The native splash continues to follow system appearance.

### Checkpoint browsing

App history puts a white Save checkpoint action in the list header and moves Refresh and Review previous state into an actions disclosure. Status appears below the list. Screenshot stacks currently indicate no capture; they do not represent historical images. Rows distinguish current and selected checkpoints, with compact dates and file counts. Rows expand inline as accordions; Review previous state only inspects a checkpoint. The checkpoint detail footer omits restore and keep actions. Pending actions announce progress.

Checkpoint details use a rounded surface with the changed-file count, a divider, and aligned metadata rows. Startup checks describe readiness only. Settings tabs use a rounded sliding indicator with a reduced-motion alternative.

Appearance also offers independent interface and monospace font dropdowns with live samples. Font preferences persist locally; unavailable fonts use system fallbacks. Code and path text share the monospace preference. Character headings keep their display typeface.

### Scoped customization

Appearance describes its local profile scope and announces successful writes. Retry saving preferences retries failed groups without requiring a different selection. Selecting a font reports the saved preference; platform availability still determines the displayed face.

The Customize Ernie with an Agent disclosure identifies the selected Agent and conversation workspace from the existing roster. Open Ernie customizer invokes the existing service, which resolves the managed app source and opens its dedicated root. Opening does not dispatch an editing request. Pending opens prevent duplicate clicks; failures retain a retry action. Development without recovery explains that source customization requires the installed app. Inspect App history links to the existing checkpoint page.

For a source change, request one scoped outcome, then inspect changed files, the observed interface result, and the returned checkpoint ID. A source checkpoint proves capture only. Native screenshot evidence and operation-to-checkpoint presentation follow their own host/history implementation; local appearance preferences remain outside source history.
