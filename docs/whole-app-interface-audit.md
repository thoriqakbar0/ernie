# Ernie interface audit

Date: 2026-09-07

**Verdict: Block interface signoff.** Two navigation failures prevent access to saved work. This audit changed no application source.

## Scope

Reviewed the current working tree through the running browser at `http://127.0.0.1:4311/?browser=1`: sidebar, empty state, Agent creation, Customize/Refine/Folder, conversation transcript, model selection, and execution details. Implementation uses React, StyleX, Base UI, and the Prime Agent integration.

Read the project UI and workflow guidance. Inspected the live interface at desktop and 320px width, plus the isolated `?scenario=agents` preview for synthetic states. Scenario interactions affect mock data, not the live daemon. The browser viewport was restored afterward.

This is an interface audit, not a backend, security, performance, or full repository correctness audit. No builds or automated tests ran, in accordance with the repository's UI workflow.

## Findings

| Severity | Domain | Location | Before | Recommended after | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Navigation | `src/renderer/components/sidebar.tsx:36` | Sidebar and search include only Agents whose root is live or working. Prepared roots and legacy Agents disappear, with no alternate roster entry point. | Keep active conversations as the default; add an accessible All Agents destination for reopening prepared and older Agents. | A saved Agent can become unreachable after navigating away before its first message. Live inspection confirmed that the previously visible inactive profiles disappear; the creation-and-navigation consequence follows from the filter and selection code. |
| HIGH | Navigation | `src/renderer/components/chat-workspace.tsx:170` | `AgentNativeSessions` renders only in the empty state. The active parent conversation has a child count and decorative avatars, but no child transcript action. | Open the child list from the sidebar group or execution details, with a clear return to the parent. | The live parent has one subagent, but its transcript cannot be reached from the active conversation. Preserve the requested clean composer footer while relocating this access. |
| MEDIUM | Typography | `src/renderer/components/conversation-transcript.tsx:58` | Assistant text supports single-backtick inline code through a regular expression; everything else stays inside one paragraph. | Render Markdown blocks and inline content with semantic elements and safe handling of links and raw HTML. | Lists, headings, fenced code, and links lose their intended structure. Existing inline code was verified live; the broader limitation is source-confirmed. |
| MEDIUM | Accessibility | `src/renderer/components/agent-workspace.tsx:20`; `src/renderer/components/agent-settings.tsx:135` | Header settings opens a panel beside the composer while focus stays at the header. Closing it restores only a locally remembered tab trigger. | Remember the actual opener, associate it with the panel, and restore focus to it on close. Make the opened region discoverable from the header. | Live inspection confirmed that focus ends on `BODY` after the close animation when settings was opened from the header. Keyboard users lose their position. |
| MEDIUM | Writing / input | `src/renderer/components/agent-settings.tsx:80` | The main creation prompt has a 200-character maximum with no visible limit or remaining count. Its text becomes Agent instructions on save. | Choose a limit suitable for instructions and explain it before entry; preserve the draft when validation fails. | The welcoming open-ended prompt invites tasks that can exceed this short limit. The HTML constraint is verified; native typing/paste truncation was not tested. Automation's set-value operation bypassed the maximum, so it is not evidence that ordinary entry accepts longer text. |
| MEDIUM | Accessibility | `src/renderer/components/agent-settings.tsx:95` | Avatar choices are named only “Character 1”, “Character 2”, and so on. | Give each choice a concise visual name, such as “Pink robot”, and retain its selected state. | Screen reader users can select a number but cannot make the visual personality choice the interface promises. Labels and selected states were inspected in the accessibility tree. |
| MEDIUM | Verification | `src/dev-only/agent-roster-scenarios.tsx:111` | Scenario Agents have associations but no native root. The current sidebar filters them all out. | Update fixtures to the implemented root model before relying on populated, long-name, or concurrent-activity scenarios. | The “Populated” preset visibly produces an empty sidebar and a generic “Saved session” header. These scenarios cannot currently establish that the real Agent interface works. |

## Domain coverage

| Domain | Coverage |
| --- | --- |
| Accessibility | Inspected control names, selected/expanded states, keyboard disclosure operation, and settings focus. Found focus restoration and avatar naming issues. Full VoiceOver navigation and forced-colors testing remain unverified. |
| Layout | Inspected desktop and 320px creation, conversation, and execution layouts. The sampled controls remained reachable; long output scrolls within its own region. Populated roster stress states are blocked by stale fixtures. |
| Writing | Reviewed creation prompts, folder/instruction restrictions, empty states, model search feedback, and execution labels. Found an undisclosed prompt limit. Legacy root guidance also still refers to the removed Saved sessions destination; address it with the navigation repair. |
| Typography | Inspected live message text, inline code, and Python source/output. Full Markdown structure is missing. Browser zoom and text-spacing override coverage remain unverified. |
| Colors | Inspected the current light palette and sampled selected/disabled states. No complete numerical contrast audit or dark-mode verification was performed; this is not a contrast compliance signoff. |
| UI | Not reviewed through the dedicated `better-ui` domain skill: that skill was unavailable. The concrete interface observations above remain valid, but holistic visual-polish coverage is incomplete. |

## Verified observations and limits

- The live execution disclosure exposes the existing Python source and its paired output. The inspection used recorded execution data; it did not run Python or send a new live message.
- Model search exposes a no-results message and a Clear search action. The picker can be dismissed with Escape. Actual model changes and provider failures were not exercised.
- Agent creation and its customization controls fit the sampled narrow viewport. A synthetic Agent was created only in the isolated preview; live creation and native folder selection were not exercised during this audit.
- Refine and Folder communicate that a bound root cannot be edited through those controls yet. This is a current capability limit, not a verified save failure.
- A synthetic disconnected state disables sending and explains that the user can keep writing. Real disconnect recovery, rejected sends, lost acknowledgements, and daemon failure recovery were not verified.
- Reduced-motion rules exist in the stylesheets. Their runtime behavior was not comprehensively exercised in this audit.
- The creation textarea has no focus outline or shadow beyond its caret; a clearer focus treatment would help. This observation alone is not treated as a confirmed WCAG failure.

## Recommended order

1. Restore access to inactive Agents and child transcripts without bringing back the removed footer sections.
2. Fix settings focus restoration and meaningful avatar labels.
3. Complete transcript Markdown rendering and make creation limits explicit.
4. Repair scenario fixtures, then repeat the currently blocked states and accessibility checks.
