# UI guidance

Use this guide for visual and interaction changes. It records design requirements, not a claim that every scenario has passed. Follow the [development workflow](workflow.md) to inspect the rendered result.

## Product context

The interface presents persistent Agents and their Prime Agent conversations. Each Agent has editable identity and defaults. Prime Agent remains the authority for execution and transcripts.

Read the [Agent-first interface specification](agent-first-interface-spec.md) when changing the Agent roster, conversation home, empty states, or their end-to-end backend flow.

[ADR 0001](adr/0001-persistent-agent-product-model.md) defines the accepted direction toward persistent Agents and their conversations. Apply it when product-model changes are in scope. The roster is implemented; routines and task surfaces remain future work.

## Current surface

The shell composes session navigation and the chat workspace. The workspace selects an empty, loading, opening-error, draft, or conversation view from session data. Empty Agents, draft conversations, and ongoing conversations use the same bottom composer.

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

Enter submits and Shift+Enter inserts a newline. Respect composition input and prevent empty submissions. Disable new submissions while the connection or recovery state prevents them. Keep Check send available because receipt inspection does not dispatch a message. Preserve typed text when a submission fails.

During active work, distinguish follow-up submission from stopping execution. Derive command availability from authoritative state. A successful stop request must not fabricate a completed execution state.

### Model and effort selection

Show the authoritative selection and make pending changes understandable. A rejected change must leave the accepted value visible and explain the failure.

Keep model rows compact and place reasoning effort in a separate footer. Show pin and visibility actions on hover, keyboard focus, or touch. If no effort is reported, display Default instead of guessing a level.

Opening a picker must place focus usefully inside it. Escape must close it and restore trigger focus. Expose expanded and selected states through accessible semantics. When search or provider filters are present, make their effects and empty results clear.

### Errors and recovery

Distinguish an opening error, command rejection, session recovery, and transport failure. Explain the consequence and available next action. Cancellation is not failure.

The UI must not invent progress, permissions, completion, or recovery actions. Use the capabilities exposed by the runtime boundary.

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

Selecting an Agent opens its most recently visited conversation, or an empty chat. Sending from that empty chat creates a conversation and submits the captured message in one action. The workspace header shows the Agent, conversation title, and actual session workspace. It owns conversation history and explicit new conversation creation; Conversation options contains settings and searchable assignment. Unassigned history remains grouped by workspace; existing sessions receive no automatic Agent assignment.

Settings edit name, avatar, role description, instructions, default workspace, and default provider/model. Failed saves and creation retain entered data for retry. Instructions and defaults affect future conversations. Reassignment changes organization without changing execution configuration or restarting the session.

Rows use authoritative activity summaries, with conversation titles as fallback. Concurrent work, recovery, and worker failures appear as explicit counts. Idle state does not imply completion or an attention request. A working avatar moves gently; reduced-motion users receive the same static avatar and activity text.

The selectable Robot, Eyes, Coffee, and Star avatars adapt the original geometry and palette from ta-0's `src/lib/about-peek-p5.ts`. Their SVG renderer is [AgentAvatar](../src/renderer/components/agent-avatar.tsx); no p5 runtime is required. See [roster verification](agent-roster-verification.md) for observed behavior and remaining checks.

Use the star control to add or remove an Agent from favorites. A filled star marks a favorite. This presentation uses the existing persisted `pinned` flag; it does not change execution priority.

## Workspace picker

The standalone development workspace picker opens an existing conversation; it does not change a conversation's execution directory. Show the target conversation title and complete workspace path. Retain search and choices when selection fails, and close only after success. Keep pending selection explicit and prevent overlapping choices. The [picker review](workspace-picker-review.md) records coverage and limitations.

Transcript entries retain accessible speaker attribution. Only system messages show a visible speaker heading; user and assistant entries start with their content.

## Message-to-work flow

Sending continues the displayed conversation. New conversation explicitly starts another Prime Agent session with the Agent’s defaults; earlier messages are not implicitly included. Quiet roster rows show the most recently visited conversation title. Active rows use authoritative activity, preserving concurrent recovery and failure counts.

The shared composer keeps typing available during submission and disconnection. Enter sends, Shift+Enter adds a newline, and composition input never sends. Show starting, sending, accepted, queued, or error feedback near the composer. Admission confirms runtime ownership, not task success. Messages sent during active work queue after the current turn. Stop remains a separate button and settles only after authoritative idle state.

Conversation creation failures retain the Agent draft and retry identity. If creation succeeds but submission fails, retain the created session and its draft. An uncertain admission is never automatically retried; explain that the conversation and connection must be inspected before resending. Later draft edits survive delayed responses.

Inline execution details belong to the session. They expose supported action phases, active tool names, queued follow-ups, child states, and parsed textual tool results. Tool errors remain distinct from overall task success. No idle transition, animation, or assistant question creates a success or attention badge. Structured reasoning and raw arguments are not execution details.

At widths up to 720 CSS pixels, the sidebar and chat occupy separate views. Selecting an Agent or history item opens its chat; Open sidebar returns to the roster. The header keeps secondary controls in Conversation options, with the full workspace path available there. Returning to a conversation restores its reading position; readers at the end follow new output, and earlier readers retain access to the latest-message control.

This flow introduces no task database, durable unread markers, automatic result summaries, or cross-conversation memory. See [chat-flow verification](chat-flow-verification.md) for observed scenarios and limits.
