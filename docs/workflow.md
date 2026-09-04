# Agent-native UI development

This workflow makes the development agent responsible for translating intent into an inspected result. Thoriq directs the experience and resolves material product choices. The agent handles routine implementation and correction within the authorized scope.

## Start with a visible outcome

Turn feedback into one observable goal. For example, “make the transcript calmer” becomes a focused proposal about spacing, emphasis, or visible controls. State the chosen interpretation before editing. Ask only when competing interpretations materially change the product.

For discussion, inspect only what the recommendation needs. For implementation, read [UI guidance](ui.md) and the relevant [architecture boundaries](architecture.md).

## Iteration loop

Each step ends with evidence that supports the next step:

1. Identify the checkout, local edits, running development profile, and browser surface.
2. Inspect the affected screen and reproduce the interaction under discussion.
3. Record the desired outcome, relevant state, viewport, and observed problem in the task.
4. Trace the affected component and state owner through `lat search`, `lat section`, and `lat refs`.
5. Make one coherent change using the existing runtime and browser hot module replacement (HMR).
6. Inspect the rendered result and exercise the affected controls, focus, scrolling, and relevant adverse state.
7. Correct defects caused by the change, then repeat the affected inspection.
8. Review the diff and return the result, evidence, and remaining uncertainty.

Use `nub run dev` when the authorized UI task needs a development runtime and none is available. Reuse a healthy runtime across renderer edits. Apply the verification and runtime limits in [AGENTS.md](../AGENTS.md#ui-iteration).

## Reproduce the same state

A useful scenario record identifies the following:

| Field | Purpose |
| --- | --- |
| Surface and viewport | Reopen the same page at the same dimensions |
| Data source | Distinguish controlled fixtures from live runtime data |
| Session and state | Identify the selected session and relevant execution or transport condition |
| Interaction | Describe the actions needed to reach the problem |
| Expected outcome | Define what the change must improve |
| Observed outcome | Record what actually happened |

Use synthetic content for durable fixtures. Keep private transcripts and authenticated runtime metadata out of checked-in evidence. A fixture must not send commands to live sessions.

Reuse an existing scenario when available. If reproduction needs new support, implement the smallest support within scope. Record missing reproduction capabilities as limitations; do not claim a scenario exists because a mock client exists.

## Inspect and correct

Compare before and after with the same content, state, and viewport. Read the relevant browser errors and use the controls. A screenshot proves appearance at one moment, not command completion or state recovery.

Review nearby components when shared styles change. Check the whole screen after local refinements to catch inconsistent spacing, emphasis, or behavior.

Browser HMR is the default UI evidence. Automated tests, builds, smoke checks, and Electron renderer launches or restarts require Thoriq’s request under the repository rules. When requested, use the relevant integration boundary; do not create unit tests.

## Handoff and completion

Return a concise account of what changed, where it is visible, what was inspected, and what remains unverified. Include evidence paths when they help reproduce or assess the result.

Use “HMR-verified” only after inspecting the updated renderer. Browser evidence does not verify Electron-specific behavior. If inspection is blocked, report the edit and the exact missing access or runtime dependency.

Update [UI guidance](ui.md) for an accepted visual or interaction rule. Update the architecture map for changed ownership. A completed iteration meets its visible outcome; publishing and release remain separate actions.
