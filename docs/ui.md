# UI guidance

Each Agent represents one native Prime Agent root. [ADR 0002](adr/0002-native-agent-roots.md) owns that model; [workflow](workflow.md) describes verification. These are interaction requirements, not a claim that all cases pass.

## Visual direction

Use warm paper surfaces, dark ink, restrained orange accents, and existing character artwork. Start directly with content; never add eyebrow labels. Keep decoration quiet in active transcripts.

Use [theme tokens](../src/renderer/theme.stylex.ts), colocated styles, and shared controls. Keep exact dimensions, font sizes, breakpoints, and animation timings in source, not duplicated here. [The StyleX map](../lat.md/styling.md) identifies those boundaries.

Use readable text, accessible speaker attribution, and restrained inline code treatment. Tool code and output preserve whitespace in named, keyboard-scrollable regions. Validate Python source and pair it with output by tool-call ID. Tool completion is distinct from task success.

## Agent roster

Selecting an Agent opens its bound root. The header shows identity and settings; ordinary navigation has no New conversation or reassignment action. Legacy profiles with several sessions need an explicit root choice. Preserve their session files without restoring the removed Saved sessions footer.

The sidebar currently shows live roots and drafts working on their first message. Idle live conversations remain visible. Filtering never deletes Agent records. The accessibility of excluded Agents is an [open finding](verification.md#open-interface-findings).

Favorites precede other Agents in stable creation order. Direct native child counts include retained completed children, with loading, unavailable, and stale states distinguished. Counts exclude independent legacy sessions. Group portraits keep children close to the parent and represent all available direct children.

Generated avatar seeds persist across navigation and reload. More faces retains the selection and replaces alternatives. Original artwork keeps its identity. Cosmetic blinking or movement never indicates execution; reduced motion preserves the static character and state text.

## Creation and settings

Add Agent opens the inline creation composer and focuses its purpose field. Generated name and avatar are ready to edit. Customize, Refine, and Folder reveal one section at a time. The purpose becomes native instructions.

Folder selection uses the native chooser; cancel preserves the form. Failed creation retains input and retry identity. Provider/model fields stay outside setup; runtime model controls remain available in the conversation.

Existing settings open below the composer. Closing restores the actual opener's focus and preserves the draft. Once prepared, root instructions and folder are read-only until a reset workflow is designed. Changing a tab must not shift the empty-state greeting or composer. Panels may animate with a reduced-motion alternative.

## Message-to-work flow

Keep selection, transcript, composer context, and runtime state aligned. Drafts and reading positions survive navigation for the application lifetime; browser reload clears them.

Enter sends, Shift+Enter inserts a newline, and input-method composition never sends. Reject blank submissions. Keep typing available during attachment, sending, and disconnection; command availability follows authoritative state.

Show creation, admission, queued, stopping, and error feedback beside its action. Acknowledgement confirms admission, not completion. Active-work messages become follow-ups; Stop is a separate action and settles on authoritative state. Preserve newer draft edits when delayed responses arrive.

An uncertain send is never automatically repeated. Check send inspects the original receipt even while disconnected. Explain remaining uncertainty and require an explicit resend decision. See [receipt rules](data-structures.md#send-receipts-and-recovery).

Conversations with messages omit settings shortcuts and subagent disclosures below the composer. Empty conversations retain them; header settings remains available. Child inspection preserves the parent's draft and reading context, uses validated native identity, and never starts a replacement session. Unavailable children show a recoverable error.

## Pickers and accessibility

Model and effort controls show accepted values, pending changes, and rejection. Missing effort displays Default. Empty filters offer recovery and restore useful focus. Escape closes pickers and returns focus to their trigger.

The development workspace picker opens an existing conversation; it does not change its execution directory. Show full paths, preserve search on failure, prevent overlapping selections, and close after success.

At narrow widths, roster and chat occupy separate views. Selecting an Agent opens chat; Open sidebar returns to navigation. Keep primary flows usable at 320 CSS pixels and 200% zoom. Wrap long content or expose its full value accessibly when truncated.

Use semantic controls, accessible names, visible focus, non-color state cues, and restrained live announcements. Respect reduced motion and forced colors. Earlier transcript readers retain their position and a jump-to-latest action; readers at the end follow output.
