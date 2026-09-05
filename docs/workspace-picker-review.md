# Workspace picker review

## Scope and coverage

Scope: the workspace picker dialog in `PrimeSessionWorkspace`, from opening through search and conversation selection. The implementation uses React, Base UI Dialog, Effect for asynchronous selection, StyleX, and Ernie's existing theme tokens. This review does not cover the full Agent roster or native daemon recovery.

Project guidance: `AGENTS.md`, `docs/ui.md`, `docs/workflow.md`, `docs/architecture.md`, `docs/data-structures.md`, and ADR 0001. Browser HMR remains the verification loop; no automated tests, build, or Electron restart was run.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Dialog semantics, accessible names, keyboard search, Enter retry, error focus, Escape and trigger restoration, busy state | Fixed failure handling; inspected keyboard paths pass |
| Layout | Production dialog at normal width and 320 × 800; eight long-path choices; scroll region | Wrapping and bounded scrolling verified |
| Writing | Heading, destination description, row conversation title, empty search, empty collection, pending and failure text | Clarified selection consequence and recovery |
| Typography | Rendered workspace names and full paths at 320px; 14px names, 12px paths, 16px narrow search input | Removed truncation; long paths remain readable |
| Colors | Computed dark-theme text/background pairs; declared light-theme muted pair | Measured pairs pass 4.5:1; light rendering not inspected |
| UI polish and motion | `better-ui` unavailable at `/Users/thor/.agents/skills/better-ui/SKILL.md` | Not reviewed by its owning skill |

## Findings and implemented fixes

All listed changes are implemented. Locations refer to the resulting source.

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Typography | `src/renderer/components/workspace-picker.styles.ts:95` | Names and paths used `ellipsis` and `nowrap` without a full-value reveal | Wrap complete names and paths with `overflowWrap: anywhere` | Workspace paths distinguish identically named folders |
| MEDIUM | Accessibility | `src/renderer/components/workspace-picker.tsx:37` | A void selection callback closed the dialog immediately | Await the typed result through Effect; retain search and choices on failure; focus recovery text | A rejected selection can be retried in context |
| MEDIUM | Writing | `src/renderer/components/workspace-picker.tsx:95` and `:160` | Workspace rows did not identify the conversation being selected | Explain the action and display the exact target conversation title | Choosing a workspace opens an existing conversation |
| MEDIUM | Writing | `src/renderer/components/workspace-picker.tsx:127` | Search returned only “No matching workspace” | Show the query, offer another search, and provide Clear search | An empty result supplies a direct recovery action |
| LOW | Layout | `src/renderer/components/workspace-picker.styles.ts:30` | A 560px minimum-height dialog reserved space even for few results | Content-sized dialog with bounded scrolling and smaller narrow padding | Empty and short lists use less space while long lists stay reachable |

## Verification

Browser route: `http://localhost:4311/?browser=1&scenario=workspaces`. It renders the production component with isolated data and Effect-backed synthetic selection.

Passed interactions:

- Open Populated: search receives focus; current workspace has both text and a check mark.
- Search for an absent name: query-specific empty state appears. Activate Clear search with Enter: query clears and search regains focus.
- Select Selection failure: the first selection leaves the dialog open and focuses its recovery message. Retry with Enter succeeds and restores focus to the updated trigger.
- Select Slow selection: selected row shows “Opening conversation…”; other selection actions are guarded while pending. Escape still dismisses the dialog without cancelling the requested selection.
- Select Long paths at 320 × 800: dialog width and scroll width both measure 288px; document width remains 320px. Full paths wrap. Temporary viewport override was reset.
- Select Empty: guidance explains how a workspace enters the list; Close and Escape remain available.

Measured WCAG 2 text ratios from rendered dark-theme colors:

| Foreground / background | Ratio |
| --- | --- |
| `rgb(248,241,235)` / `rgb(33,27,23)` | 15.22:1 |
| `rgb(193,180,170)` / `rgb(33,27,23)` | 8.41:1 |
| `rgb(193,180,170)` / `rgb(75,42,24)` | 6.31:1 |

The declared light muted pair `#6f655d` / `#fffaf5` measures 5.48:1. This is a source-token calculation, not light-mode browser evidence.

Static checks: `nub run typecheck`, `nub run lint:stylex`, `nub run lint:outline`, and `git diff --check` pass.

Not verified: actual screen-reader speech, 200% browser zoom, RTL rendering, light-theme rendering, and reduced-motion emulation. The existing global reduced-motion rule was inspected in source. The dialog has no separate catalog-loading state; the scenario covers pending selection.

## Verdict

Approve for the inspected scope. No HIGH findings remain in that coverage. Unverified states and the unavailable `better-ui` domain remain explicit limits.
