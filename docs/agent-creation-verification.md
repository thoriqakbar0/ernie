# Agent introduction verification

Browser inspection on 2026-09-06 verified the revised Agent creation and editing flow on `main` at `e8a6f1f` with local changes. The existing service host stayed alive at `http://127.0.0.1:4311/?browser=1`.

## Observed behavior

The live profile used synthetic Agent data and the isolated workspace from [conversation verification](chat-flow-verification.md#live-lifecycle-verification-2026-09-06).

| Check | Evidence |
| --- | --- |
| Introduction | Name and purpose used direct questions; optional instructions stayed collapsed during creation. Provider, model ID, and their explanatory copy were absent |
| Generated choices | Twelve characters showed varied silhouettes, colors, and expressions. More faces replaced alternatives. Selecting one updated the large preview |
| Motion | Rendered SVG groups had distinct sway and blink animations with varied durations. Reduced-motion rules disable both in source |
| Native folder picker | Change folder opened the actual macOS directory chooser. Cancel preserved entered values. Selecting the isolated workspace updated the form |
| Persistence | Created Pip with a generated character, purpose, notes, and chosen folder. After browser reload, the rendered SVG paths and fill matched. Edit restored the saved name, notes, folder, and selected character |
| Rejection | Reject mutations in the isolated Agent scenario retained Miso's name, purpose, and selected character while showing the failure |
| Successful creation | In the scenario, Meet Miso saved the Agent and opened its empty conversation with the selected folder and focused composer |
| Narrow layout | At 390 × 844 CSS pixels, the edit dialog, twelve choices, expanded notes, folder control, and save action fit without horizontal document overflow |

## Verification limits

Changing the Agent context triggered the known missing-provider HMR error. One browser reload recovered that boundary while the service host stayed alive. Subsequent component edits used HMR. The persistence check also intentionally reloaded the browser.

TypeScript, the StyleX boundary check, and diff whitespace validation passed. No automated tests or builds ran. The native folder chooser was inspected, but an Electron renderer was not launched or restarted. Reduced-motion source rules were inspected; OS media emulation and assistive-technology announcements were not exercised in this iteration.

## Composer refinement

Browser HMR review on 2026-09-06: Add Agent replaces the workspace body with an inline composer. The purpose input receives focus; Customize reveals character choices and settings. Reviewed the expanded form at desktop width and the compact form at 390px. Mobile Add Agent closes navigation to expose the composer. No builds or automated tests were run for this refinement.
