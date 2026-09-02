# Ernie UI specification

## Decision

Design Ernie as a complete desktop-first workspace where a developer can start, monitor, interrupt, and continue Prime Agent sessions while preserving workspace and runtime context.

## Actor and success

A developer working in a local repository can answer four questions at a glance:

1. Which session is selected?
2. Which directory will Prime Agent change?
3. What is Prime Agent doing in the current session?
4. What can I do next?

Success means the developer can create or select a session, send work, inspect the transcript and live activity, stop work, change models, and recover from a connection problem without reading runtime logs.

## Constraints

- `PrimeSessionSnapshot` remains the authoritative UI state.
- Production RPC, events, session selection, and model APIs remain unchanged.
- The sidebar can render as a separate Zenbu view.
- The production components must run in browser development and Electron.
- Existing accessible names and test hooks remain stable where possible.
- No UI may imply progress, permissions, or actions the runtime does not expose.
- Do not render standalone status indicators. State belongs in action labels, session activity copy, or recovery messages.

## Assumptions

- Ernie is primarily used by developers on desktop-sized windows.
- Narrow windows still need session switching, composition, and transcript reading.
- The existing Ernie navy, coral, and warm-white mark is the durable brand base.

## Primary flow

```text
Open Ernie
  ├─ no sessions ──> New conversation ──> draft session
  └─ sessions exist ──> select current or another session
                              │
                              v
                      confirm workspace + model
                              │
                              v
                         write instruction
                              │
                              v
                idle ──> send first turn ──> working
                                             ├─ queue follow-up
                                             ├─ inspect activity
                                             └─ stop
                              │
                              v
                      read result / continue
```

## Structural wireframe

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ draggable title region                                                       │
├──────────────────────┬───────────────────────────────────────────────────────┤
│ ERNIE         [+]    │ Session name                                           │
│ Local agent desk     │ /workspace/ernie                                       │
│                      ├───────────────────────────────────┬───────────────────┤
│ SESSIONS          3  │ Conversation ledger               │ SESSION ACTIVITY  │
│                      │                                   │ Running turn      │
│ Build chat           │ PRIME AGENT                       │ GPT-5             │
│ New UI               │ Message content…                  │ Tools: bash       │
│ Release              │                                   │ 2 child agents    │
│                      │ YOU                               │                   │
│ /workspace/ernie     │ Message content…                  │                   │
│                      │                                   │                   │
│                      │ ┌───────────────────────────────┐ │                   │
│                      │ │ Ask Prime Agent…              │ │                   │
│                      │ │ [Model]                 [Send]│ │                   │
│                      │ └───────────────────────────────┘ │                   │
└──────────────────────┴───────────────────────────────────┴───────────────────┘
```

At narrow widths, the left region becomes a horizontal session strip above the workspace. The activity panel moves into the document flow below the transcript header and above the composer.

## Component tree

```text
App
├─ Titlebar
└─ app shell
   ├─ View(app/sidebar)
   │  └─ Sidebar
   │     ├─ ErnieMark
   │     ├─ session navigation
   │     └─ workspace footer
   └─ ChatWorkspace
      ├─ WorkspaceHeader
      ├─ SessionNotice
      ├─ PrimeEmptyState | WorkspaceLoading | session stage
      │  ├─ ConversationTranscript
      │  ├─ SessionInspector
      │  └─ PrimeComposer
      │     └─ ModelPicker
      └─ action error announcement
```

## State model

| State | Visible meaning | Available actions | Exit |
|---|---|---|---|
| Empty | No sessions exist | New conversation | Session creation succeeds |
| Creating | Prime Agent is creating a session | Wait | Success or creation error |
| Creation failed | Session was not created | New conversation | Retry succeeds |
| Opening | Selected session is attaching | Wait, select another session | Snapshot arrives or attach fails |
| Draft | Session exists with no first turn | Choose model, send | First turn is admitted |
| Idle | Transcript is current and no work is active | Send, select model, switch session | New turn starts |
| Working | Prime Agent owns active work | Queue follow-up, inspect, stop | Work completes or stops |
| Recovering | Runtime is restoring session work | Inspect, switch session | Idle, working, or transport failure |
| Reconnecting | Transport is temporarily interrupted | Inspect, switch session | Connected or failed |
| Failed | Commands are paused | Switch session, wait for connection | Transport reconnects |
| Action error | A command or model update failed | Correct and retry | Next successful action |

Cancellation is not failure. The interface returns to idle when a stop request succeeds.

## Interaction contract

### Session selection

- Selecting a session changes the heading, transcript, activity, composer state, and `aria-current` marker together.
- A draft from one session never appears in another.
- Rapid selection must converge on one selected session.

### New conversation

- The action is available from the sidebar and empty state.
- While creation is pending, duplicate creation is blocked and status text stays visible.
- A creation error remains visible with the same action available for retry.

### Composer

- Enter submits. Shift+Enter inserts a newline.
- Empty input cannot submit.
- Disconnected or failed sessions cannot submit.
- During active work, the text area accepts a follow-up and the primary round control stops the active work.
- Model selection updates only after the runtime accepts it; failures restore the authoritative model.

### Model picker

- Trigger exposes expanded state and the selected model name.
- Opening focuses search.
- Escape closes and returns focus to the trigger.
- Provider filters expose pressed state.
- An empty result names the query outcome.

## Responsive behavior

| Width | Behavior |
|---|---|
| `> 1180px` | Sidebar, transcript, and activity rail are visible together. |
| `721–1180px` | Activity rail moves below the workspace header in a compact row or document section. |
| `≤ 720px` | Sidebar becomes a horizontal session strip above the workspace. Footer details collapse. |
| `≤ 480px` | Brand block narrows, session tiles shorten, composer controls remain at least 40px. |

Transcript text keeps priority. Model IDs, paths, and session names truncate before the composer or primary actions do.

## Keyboard and focus

1. Skip link.
2. New conversation.
3. Session group disclosure.
4. Session buttons.
5. Workspace header actions, when present.
6. Transcript links or controls.
7. Composer input.
8. Model picker.
9. Send or stop.

Opening the model picker moves focus to search. Closing restores focus to the model trigger. New session creation moves product context to the new session while the textarea receives focus in the draft hero.

## Motion

- Session selection crossfades surface tone over 160ms.
- Model picker appears with a short opacity and 4px translate transition.
- Reduced motion removes translation and animated loading treatments.

## Adverse-state checks

| Scenario | Required behavior |
|---|---|
| Zero sessions | One clear new-conversation action and workspace orientation. |
| Long session names | Truncate without hiding state text. Full value remains available as a title. |
| Long paths | Truncate in compact UI; preserve full path in `title`. |
| Many sessions | Sidebar scrolls independently. Narrow mode scrolls the strip horizontally. |
| Failed model update | Show error and restore the authoritative model. |
| Reconnect during a draft | Preserve typed text but disable submission until connected. |
| Rapid session switching | Heading, transcript, composer, and current marker converge. |
| Keyboard-only use | Every primary flow completes with visible focus. |
| Reduced motion | No pulsing or translated overlays. |
| 200% zoom / 320px width | Page reflows without horizontal document scrolling. |

## Acceptance scenarios

```text
Given no sessions exist
When the developer selects New conversation
Then creation status is announced
And the new draft session becomes current
And the message field is enabled
```

```text
Given Prime Agent is working
When the developer types a follow-up
Then the interface labels it as a queued follow-up
And the developer can stop active work without losing the transcript
```

```text
Given a model change fails
When the runtime rejects the request
Then an alert explains the failure
And the picker returns to the authoritative model
```

```text
Given the window is 600 CSS pixels wide
When sessions exist
Then the session navigation is above the workspace
And the transcript and composer retain the full content width
```

## Non-goals

- New runtime commands such as retry, rename, archive, delete, or permissions.
- A second renderer state model.
- Fabricated token, cost, progress, or completion metrics.
- Replacing the Prime Agent protocol or Zenbu view topology.
