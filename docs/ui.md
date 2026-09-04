# UI guidance

Use this guide for visual and interaction changes. It records design requirements, not a claim that every scenario has passed. Follow the [development workflow](workflow.md) to inspect the rendered result.

## Product context

The current interface presents Prime Agent sessions. A developer needs to understand the selected session, its workspace, its execution state, and the next available action.

[ADR 0001](adr/0001-persistent-agent-product-model.md) defines the accepted direction toward persistent Agents and their conversations. Apply it when product-model changes are in scope. Do not infer that its roster, routines, or task surfaces already exist.

## Current surface

The shell composes session navigation and the chat workspace. The workspace selects an empty, loading, opening-error, draft, or conversation view from session data. A draft uses the central composer; a conversation places the composer below its transcript.

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

Inspect the current surface before choosing a layout change. Session navigation includes search and activity filtering; it still represents real Prime Agent sessions.

## Visual direction

Start directly with the main heading or content. Never use eyebrow labels above headings.

Give the transcript and composer priority. Use spacing, type, and surface contrast to distinguish content from controls. Place execution state in relevant actions, activity text, or recovery messages; avoid standalone decorative status indicators.

Use the semantic theme and shared controls already defined in the renderer. Follow the [StyleX boundary](../lat.md/styling.md) for component styles. Keep exact color values, dimensions, breakpoints, and motion timings in their source definitions. Establish a new shared token only when the design needs a reusable distinction.

Settle layout and information priority before refining typography, spacing, color, and motion. Review the complete screen after local changes.

## Interaction requirements

Requirements below define expected behavior. Verify the affected requirement during a change and report any gap between it and the implementation.

### Session continuity

Selection must keep the transcript, composer context, runtime state, and navigation marker aligned. A draft from one session must never appear in another. Rapid switching must converge on one selected session.

Cross-session draft retention is a separate lifetime decision. Read [architecture ownership](architecture.md#ownership) before promising that switching away and back preserves text.

### Creation and submission

Show pending creation and prevent duplicate creation while it is pending. Keep a creation error visible with a usable recovery action.

Enter submits and Shift+Enter inserts a newline. Respect composition input and prevent empty submissions. Disable submission while the connection or recovery state prevents it. Preserve typed text when a submission fails.

During active work, distinguish follow-up submission from stopping execution. Derive command availability from authoritative state. A successful stop request must not fabricate a completed execution state.

### Model and effort selection

Show the authoritative selection and make pending changes understandable. A rejected change must leave the accepted value visible and explain the failure.

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
