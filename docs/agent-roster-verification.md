# Agent roster verification

This record separates observed behavior from prepared coverage. The implementation is based on `origin/main` at `a5f6f1f11affe68cb8b9e50c711e4d09a03efe53` in `/Users/thor/work/.worktrees/ernie/agent-roster`.

## Observed through browser HMR

The live browser profile runs on `http://localhost:4311/?browser=1`. Its Agent records use that profile's Zenbu database; Prime Agent remains the native execution authority.

| Behavior | Evidence |
| --- | --- |
| Persistence | Created and edited Agents remain after browser reload |
| Native creation | A created conversation's native `get_system_prompt` contains its saved instructions |
| Reassignment | The same native conversation retains those instructions after assignment to another Agent |
| Draft navigation | Unsent session text remains after switching Agents and returning |
| Settings rejection | Invalid workspace input retains fields; corrected input saves |
| Search | Names and roles filter roster and assignment choices |
| Favorites | Favorite Agents precede others in stable creation order |
| Empty roster | First-Agent action and history remain reachable |
| Concurrent activity | Production rows show working, recovering, and failed counts together |
| Reassignment during work | Isolated scenario keeps the working session and Stop action after reassignment |
| Connection failure | Reconnect and failed-connection scenarios preserve transcript and disable commands |
| Rejected mutation | Isolated settings rejection retains the entered name and visible retry feedback |
| Keyboard | Tab enters roster; Enter opens controls; Escape returns focus to conversation-history trigger |
| Narrow width | At 320 × 800, long names truncate and the composer remains within the viewport; no horizontal document overflow |

The isolated route `?browser=1&scenario=agents` reuses production components. Its synthetic sessions do not send live commands. Scenario changes reset fixture state. Reduced-motion animation overrides were inspected in source; this browser controller cannot emulate the media preference, so reduced-motion rendering remains unverified.

## Static checks

`nub run link`, `nub run typecheck`, `nub run lint:stylex`, `nub run lint:outline`, `nub run lint:boundaries`, and `nub run lat:check` passed. No build or Electron restart was performed. The documentation graph reports its existing missing-init-version warning while passing checks.

## Focused backend integration verification

Both Agent cases in [the daemon integration file](../src/integration/prime-agent-daemon.integration.test.ts) passed on September 5, 2026:

```sh
nub --test --test-reporter=tap --test-name-pattern='Agent durability|Agent instructions' src/integration/prime-agent-daemon.integration.test.ts
```

The native case verifies instruction application and session identity across isolated daemon restart. The real Zenbu service case verifies disk-write rejection and retry, reconciliation and conflict rejection, creation deduplication, assignment persistence across service-host restart, immutable origins after edits, native recovery through Ernie, unassignment, rejected assignment, and failed creation. No model inference is required.

Recovery exposed and now covers attachment before the first catalog refresh. The attachment records its native session path; fallback catalog lookup avoids waiting on the current recovery. Session projections omit absent optional fields so recovery updates pass the strict event contract.

The older `roster` profile's one Agent and one association were imported into `roster-current`, yielding three Agents and two associations. Disk comparison verified preserved origins. Both database files were backed up before import; the source remains unchanged. The current browser displays all three Agents. The production transcript scenario was HMR-inspected: assistant content has no repeated visible speaker heading, and its article retains accessible attribution. Restored cloud scripts match the original checkout byte-for-byte and pass shell/JavaScript syntax checks; cloud execution was not exercised.

These cases use disposable data and their own daemon. The user's active daemon and Electron runtime were not restarted. This verifies native instruction retention through Ernie's persisted-origin recovery path; it does not claim inference or every UI scenario is automated.
