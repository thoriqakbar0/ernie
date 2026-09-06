# Execution interface review

Scope: transcript typography and execution disclosures in the running Ernie browser preview. React, StyleX, existing theme tokens, and native details/summary elements. Guidance: AGENTS.md, docs/ui.md, docs/workflow.md, and the existing native session model. No session data was changed or execution rerun.

## Coverage

| Domain | Evidence | Result |
| --- | --- | --- |
| Accessibility | Native disclosures, accessibility tree, Enter activation, visible focus on output | Improved keyboard access |
| Layout | Expanded Python card at 320px; transcript width and scroll extent | No page overflow; code scrolls within its region |
| Writing | Disclosure, source, output, error and empty labels | Shortened; statuses remain literal |
| Typography | Real transcript and Python output | Inline code and readable monospace output |
| Colors | Rendered light-mode foreground/background pairs | Summary 5.00:1; Python summary 17.28:1; code/output 15.77:1 |
| UI | Owning better-ui skill unavailable | Not reviewed |

## Findings addressed

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| MEDIUM | Typography | src/renderer/components/conversation-transcript.styles.ts:51 | Backtick spans displayed as ordinary prose | Single-backtick inline code uses monospace and a subtle surface | Distinguishes identifiers from prose; this is not a complete Markdown renderer |
| MEDIUM | Layout | src/renderer/components/conversation-activity.tsx:42 | Unstructured activity text; output only | Tool cards pair validated Python code and output | Makes execution evidence readable without guessing code from output |
| LOW | Accessibility | src/renderer/components/conversation-activity.tsx:32 | Plain small summary | 44px disclosure with explicit focus and chevron | Makes expansion discoverable and keyboard-visible |
| LOW | Writing | src/renderer/components/conversation-activity.tsx:32 | Execution details | Behind the scenes, execution count, Code, Output | Adds a small playful touch while retaining concrete labels |

## Verification

HMR: inspected the existing ipython result and source from ernie-child-verification. Opened both disclosures with Enter. Focused the output with Tab. At 320px the transcript had clientWidth and scrollWidth of 320; source/output each had a 236px viewport and independent horizontal scrolling. Restored desktop viewport and left the execution expanded.

Source review includes unavailable, queued, error, and no-output branches. Live error/loading fixtures, VoiceOver, dark mode, 200% zoom, full Markdown, and automated tests: Not verified. No builds or automated tests were run, per repository UI workflow.

Approve for the inspected light-mode transcript and completed Python execution. No holistic claim for unreviewed domains or states.
