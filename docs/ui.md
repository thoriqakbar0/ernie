# UI guidance

Use this guide for visual and interaction changes. It records design requirements, not a claim that every scenario has passed. Follow the [development workflow](workflow.md) to inspect the rendered result.

## Product context

Each Agent represents one native Prime Agent root. Ernie provides appearance and navigation; Prime Agent owns the name, configuration, transcript, execution, and children.

Read the [Agent-first interface specification](agent-first-interface-spec.md) when changing the Agent roster, conversation home, empty states, or their end-to-end backend flow.

Apply [ADR 0002](adr/0002-native-agent-roots.md) for root ownership. Routines and task surfaces remain future work.

## Current surface

The shell composes Agent navigation and the chat workspace. Empty Agents and draft conversations pair a left-aligned introduction with the shared composer. Ongoing conversations dock that composer below the transcript. Attachment and opening errors keep composition available.

The unselected workspace introduces the Agent model with the existing characters, a display heading, and a direct creation action. Display text uses Gelica when available and Georgia otherwise. An Agent introduction gives its name visual emphasis while preserving its role and execution workspace. Decoration stays out of active transcripts.

Use these source entry points for the affected surface:

| Surface | Source |
| --- | --- |
| Shell and sidebar visibility | [App](../src/renderer/components/app.tsx) |
| Session navigation | [Sidebar](../src/renderer/components/sidebar.tsx) |
| Workspace composition and action feedback | [ChatWorkspace](../src/renderer/components/chat-workspace.tsx) |
| Transcript and scroll behavior | [ConversationTranscript](../src/renderer/components/conversation-transcript.tsx) |
| Submission and stop controls | [PrimeComposer](../src/renderer/components/prime-composer.tsx) |
| Model and effort selection | [ModelPicker](../src/renderer/components/model-picker.tsx) |
| Shared theme values | [theme.stylex.ts](../src/renderer/theme.stylex.ts) |
| Component layout and responsive rules | Colocated `*.styles.ts` modules, described in the [StyleX map](../lat.md/styling.md) |
| Document defaults and accessibility resets | [main.css](../src/renderer/main.css) |

Inspect the current surface before choosing a layout change. Agent search matches names and roles. Favorite Agents precede the remaining roster; creation order stays stable within each group. Activity never reorders rows.

## Visual direction

Start directly with the main heading or content. Never use eyebrow labels above headings.

Give the transcript and composer priority. Use spacing, type, and surface contrast to distinguish content from controls. Place execution state in relevant actions, activity text, or recovery messages; avoid standalone decorative status indicators.

Use the semantic theme and shared controls already defined in the renderer. Follow the [StyleX boundary](../lat.md/styling.md) for component styles. Keep exact color values, dimensions, breakpoints, and motion timings in their source definitions. Establish a new shared token only when the design needs a reusable distinction.

Settle layout and information priority before refining typography, spacing, color, and motion. Review the complete screen after local changes.

## Interaction requirements

Requirements below define expected behavior. Verify the affected requirement during a change and report any gap between it and the implementation.

### Session continuity

Selection must keep the transcript, composer context, runtime state, and navigation marker aligned. A draft from one session must never appear in another. Rapid switching must converge on one selected session.

Unsent text and transcript reading positions survive navigation for the application lifetime, keyed by session. Browser reload ends that lifetime. Read [architecture ownership](architecture.md#ownership).

### Creation and submission

Show pending creation and prevent duplicate creation while it is pending. Keep a creation error visible with a usable recovery action.

Keep the Agent draft visible until creation returns and transfers draft ownership to the session. During attachment, keep the session draft editable and explain that opening is pending. Use the actual session workspace for an existing draft, even after Agent defaults change.

Enter submits and Shift+Enter inserts a newline. Respect composition input and prevent empty submissions. Disable new submissions while the connection or recovery state prevents them. Keep Check send available because receipt inspection does not dispatch a message. Preserve typed text when a submission fails.

During active work, distinguish follow-up submission from stopping execution. Derive command availability from authoritative state. A successful stop request must not fabricate a completed execution state.

### Model and effort selection

Show the authoritative selection and make pending changes understandable. A rejected change must leave the accepted value visible and explain the failure.

Keep model rows compact and place reasoning effort in a separate footer. Show pin and visibility actions on hover, keyboard focus, or touch. If no effort is reported, display Default instead of guessing a level.

Opening a picker must place focus usefully inside it. Escape must close it and restore trigger focus. Expose expanded and selected states through accessible semantics. When search or provider filters are present, make their effects and empty results clear.

After clearing model filters, focus the search input when present, otherwise a restored model option. Small model catalogs do not have a search input. Empty-state recovery controls meet the design system's 40px target minimum, or 44px at narrow widths.

### Errors and recovery

Distinguish an opening error, command rejection, session recovery, and transport failure. Explain the consequence and available next action. Cancellation is not failure.

The UI must not invent progress, permissions, completion, or recovery actions. Use the capabilities exposed by the runtime boundary.

In conversation history, failure and recovery take precedence over activity summaries retained from earlier work.

## Responsive layout and accessibility

Keep session selection, transcript reading, and composition usable at narrow widths and increased zoom. Let long names, paths, and model identifiers wrap or truncate before they obstruct primary controls. Keep the full value accessible when truncation hides necessary context.

Use semantic controls with accessible names and visible keyboard focus. Preserve a logical order through navigation, transcript controls, composer, and pickers. Announce relevant asynchronous outcomes without flooding assistive technology during streaming.

Respect reduced motion and forced colors. Motion should explain a change or maintain continuity. Keep essential state understandable when animation is disabled.

## Adverse states to inspect

Select scenarios affected by the change. These are inspection requirements, not an inventory of implemented fixtures:

| Scenario | Expected outcome |
| --- | --- |
| No sessions or pending creation | Clear composition entry and creation feedback |
| Session opening fails | Visible failure and supported recovery action |
| Long transcript or long message | Readable content and usable scroll controls |
| New output while reading earlier content | Reading position remains usable; latest output stays reachable |
| Long names, paths, or many sessions | Navigation remains usable without obscuring primary actions |
| Rejected submission | Error remains understandable and typed input is preserved |
| Rejected model or effort change | Accepted selection remains visible |
| Reconnection while composing | Draft remains visible and submission follows connection state |
| Rapid session switching | Displayed content and actions belong to the selected session |
| Keyboard-only interaction | Primary flows work with visible, predictable focus |
| Light, dark, reduced motion, or forced colors | Content, controls, and state remain understandable |
| 200% zoom or 320 CSS-pixel width | Primary flows remain usable without document overflow |

Controlled scenarios should use production components through the [development scenario boundary](architecture.md#development-scenarios). Label fixture evidence separately from live runtime evidence.

## Keeping this guide current

Update this document when a visual or interaction decision is accepted. Record a durable product-model decision in an ADR. Keep implementation ownership in the architecture map and verification evidence in the task handoff.

## Agent roster

Selecting an Agent opens its most recently visited conversation, or an empty chat. Sending from that empty chat creates a conversation and submits the captured message in one action. The workspace header shows the Agent identity. Conversation titles remain in history and navigation; the workspace path remains in Conversation options. It owns conversation history and explicit new conversation creation; Conversation options contains settings and searchable assignment. The unassigned History section is temporarily hidden; existing sessions receive no automatic Agent assignment.

Settings introduce the Agent through its name, character, and purpose. Instructions sit under an optional disclosure. The folder defaults to the selected conversation, selected Agent, or current workspace, in that order. Change folder opens the native directory chooser. Cancellation preserves the current folder and entered text. A successful creation opens the new Agent's empty conversation space.

Provider and model fields are hidden during creation and editing. New Agents use the runtime default; editing preserves existing saved model settings. Failed saves retain entered data for retry. Instructions and defaults affect future conversations. Reassignment changes organization without changing execution configuration or restarting the session.

Assignment search explains an empty result and offers Clear search, which restores input focus. Agent filtering does not change saved associations.

Rows use authoritative activity summaries, with conversation titles as fallback. Concurrent work, recovery, and worker failures appear as explicit counts. Idle state does not imply completion or an attention request. A working avatar moves gently; reduced-motion users receive the same static avatar and activity text.

New Agents receive a generated character recipe. The chooser shows twelve characters; More faces keeps the selected character and generates eleven alternatives. Eight silhouettes combine with colors and expressions. The saved seed preserves appearance across the roster, conversation, editing, and reload. Character previews sway and blink at varied tempos. Idle blinking is cosmetic and does not imply execution. Reduced motion disables both animations.

Existing Robot, Eyes, Coffee, and Star identities retain their ta-0 artwork through [AgentAvatar](../src/renderer/components/agent-avatar.tsx). [GeneratedCharacter](../src/renderer/components/generated-avatar.tsx) renders new recipes as SVG without external assets or a generation service. See [creation verification](agent-creation-verification.md) for current evidence.

Use the star control to add or remove an Agent from favorites. A filled star marks a favorite. This presentation uses the existing persisted `pinned` flag; it does not change execution priority.

## Workspace picker

The standalone development workspace picker opens an existing conversation; it does not change a conversation's execution directory. Show the target conversation title and complete workspace path. Retain search and choices when selection fails, and close only after success. Keep pending selection explicit and prevent overlapping choices. The [picker review](workspace-picker-review.md) records coverage and limitations.

Transcript entries retain accessible speaker attribution. Only system messages show a visible speaker heading; user and assistant entries start with their content.

## Message-to-work flow

Sending continues the Agent’s bound root. The normal header has identity and settings; it has no New conversation or reassignment action. Sidebar subtitles show native subagent counts. Profiles with multiple legacy sessions require an explicit root choice. Other session files remain stored; the workspace does not display a Saved sessions section.

The shared composer keeps typing available during submission and disconnection. Enter sends, Shift+Enter adds a newline, and composition input never sends. Show starting, sending, accepted, queued, or error feedback near the composer. Admission confirms runtime ownership, not task success. Messages sent during active work queue after the current turn. Stop remains a separate button and settles only after authoritative idle state.

Conversation creation failures retain the Agent draft and retry identity. If creation succeeds but submission fails, retain the created session and its draft. An uncertain admission is never automatically retried; explain that the conversation and connection must be inspected before resending. Later draft edits survive delayed responses.

Inline execution details belong to the session. They expose supported action phases, active tool names, queued follow-ups, child states, and parsed textual tool results. Tool errors remain distinct from overall task success. No idle transition, animation, or assistant question creates a success or attention badge. Structured reasoning and arbitrary raw arguments are not execution details. Validated Python source is shown beside its matching tool result.

At widths up to 720 CSS pixels, the sidebar and chat occupy separate views. Selecting an Agent or history item opens its chat; Open sidebar returns to the roster. The header opens inline Agent settings; the Folder panel exposes the working directory. Returning to a conversation restores its reading position; readers at the end follow new output, and earlier readers retain access to the latest-message control.

This flow introduces no task database, durable unread markers, automatic result summaries, or cross-conversation memory. See [chat-flow verification](chat-flow-verification.md) for observed scenarios and limits.

### Agent creation disclosure

Add Agent opens an inline composer in the workspace. The purpose input receives focus. A name from `names.ts` and a generated avatar are ready to use. Customize reveals identity and character choices, Refine holds instructions, and Folder holds the native chooser. Only one section is open at a time. Cancel restores the previous conversation. Selecting another Agent or history entry closes creation after selection succeeds. Editing an existing Agent opens below its composer. Cancel returns focus to the opening control and preserves the conversation draft. Once the root is prepared, Refine and Folder show the saved configuration and explain the unavailable live-change capability. The purpose input becomes part of native instructions at creation.

The workspace header has zero vertical padding, 11px right padding, and 20px left padding with the sidebar visible. A closed sidebar reserves 54px on the left for its reopen control. The existing 720px breakpoint reserves 48px. Negative padding is invalid CSS.

Input focus uses the existing border color or a subtle container background, without an outer ring. The Agent creation textarea uses the shared content sizing, grows to 320px or 40% of viewport height, then scrolls. It has no manual resize handle.

### Agent row actions and greeting

Agent rows expose a context menu for opening, customizing, and toggling favorites. The empty conversation greeting is “what’s next?” without repeating the Agent name or role. Sidebar and greeting avatars animate gently with transparent backgrounds; reduced motion disables animation. Cosmetic motion does not indicate running work.

### Native child inspection

Native children appear beneath their root’s composer after admission. Each row shows the native name, state, and explicit reply receipt when available. Disconnection marks the last known roster. Unsupported roster access is stated explicitly.

Opening a child inspects its own transcript without sending or replacing a runtime. Back to Agent closes inspection while the parent remains mounted with its draft. The parent uses its existing event feed; the open read-only inspection refreshes every two seconds. A retained child without an active target opens its saved transcript read-only. The service validates its native sidecar, child ID, parent session file, and child depth before reading it. Missing or mismatched files report unavailable; inspection never starts a replacement root.

### Inline settings layout

Existing Agent settings use a muted warm surface with explicit ink colors. Identity precedes a compact wrapping character gallery; the neutral save action aligns to the trailing edge. Disclosure controls show their selected state with both fill and underline. The name input and settings controls use a 2px keyboard focus perimeter. The working-folder disclosure exposes the complete wrapping path through native keyboard interaction.

Agent sidebar subtitles show the direct native child-registry count, including retained completed children. Each bound root uses the shared snapshot subscription. Missing or unsupported data is unavailable, loading is explicit, and disconnected snapshots show a last-known marker. The count does not include independent legacy sessions or infer a Ready state.

The conversation footer aligns settings and native-session disclosures to the composer’s 720px maximum width. Subagents start collapsed. Expanded child rows separate wrapping names, status, and an opening chevron. The dock scrolls within 60dvh to retain transcript space; the empty-state composer keeps its natural height.

Creation greetings introduce the generated name with a playful variation selected once per form. Renaming updates the greeting and “Bring {name} to life” action without changing the variation. Optional creation panels use Base UI Collapsible with a 220ms height and opacity transition; reduced motion removes the transition. The workspace slot shares the workspace surface color.

Sidebar group portraits render every available direct native child beneath the parent, wrapping into two compact columns without a child-count cap. The native count remains the authoritative total.

Existing Agent settings controls give 120ms press feedback at scale 0.97. Their panel enters and exits with a 180ms opacity and transform transition from 6px above at scale 0.985, using cubic-bezier(0.23, 1, 0.32, 1). Reduced motion removes transforms and uses an 80ms fade. Closing unmounts the form after the exit transition.

The empty conversation uses a viewport-based top inset rather than centering the combined composer and settings height. Opening settings therefore keeps the greeting and composer anchored; overflow remains scrollable. Switching Customize, Refine, and Folder fades and slides the new panel content 6px horizontally over 160ms, with an 80ms opacity-only reduced-motion alternative. Child portraits overlap the parent footprint and use the small avatar size.

Conversations with messages omit the settings shortcuts and Subagents disclosure below the composer. Empty conversations retain them. The header settings action still opens the inline editor and its section controls.

Transcript text uses 16px type with unitless 1.6 line height and the existing 66ch measure. System speaker labels stay at least 12px. Native child counts use tabular numerals. Empty-state headings balance wrapping; short settings descriptions use pretty wrapping. Composer, creation notes, and sidebar search inputs use 16px text on small screens. Font smoothing and optical sizing are set once on the root.

The sidebar lists only Agents whose bound native root has a live conversation (or a draft currently working on its first message). Prepared empty roots and archived sessions are excluded. Idle live conversations stay visible. Filtering uses the native session catalog and never deletes Agent profiles or session files.

The execution disclosure uses a compact Behind the scenes card with a tool count. Python calls pair validated source with matching output by tool-call ID. Code and output preserve whitespace in named, keyboard-scrollable regions. Completed describes the tool result, not overall task success. Assistant inline code uses monospace treatment; other message text remains unchanged.
