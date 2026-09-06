# Native Agent verification

Verified locally on 2026-09-07 in `/Users/thor/work/ernie`, on `main` with uncommitted changes. [ADR 0002](adr/0002-native-agent-roots.md) owns the product decision.

## Native ownership and recovery

The disposable integration case passed through the real Zenbu service and Prime Agent daemon:

```sh
nub --test --test-name-pattern='Agent durability' src/integration/prime-agent-daemon.integration.test.ts
```

The final run passed one test in 15.7 seconds. It verifies one durable root across duplicate requests, concurrent retries, lost activation responses, metadata write failures, service restart, and daemon restart. It also checks native rename collisions, immutable root configuration, duplicate ownership rejection, send receipt recovery, invalid folders, and explicit legacy root selection while retaining both original session files.

One intermediate run timed out waiting for the isolated service to start, before its assertions. Startup failures now include bounded host output. The subsequent run passed.

## Native child inspection

A disposable native root spawned one actual child through Prime Agent. The child completed with `CHILD_PROOF_OK` without file operations.

| Identity | Observed value |
| --- | --- |
| Durable root | `01a07831-41ba-72d1-979a-881301f7231a` |
| Child registry ID | `sub-24183f2b` |
| Durable child | `01a07831-544f-7459-9734-e4ebf28ac320` |

Inspection returned the child's own transcript while it had a live target. An unrelated child ID was rejected. After restoring the same root worker, the retained roster had no active child target. Inspection then read the saved child transcript using validated native metadata and parent references. It did not start another child or root.

The child was done without an explicit reply receipt. Completion and reply receipt remain separate native facts in the UI.

## Browser HMR review

The browser preview ran at `http://127.0.0.1:4311/?browser=1` with the isolated `live-verification-20260906` profile. The runtime stayed alive during renderer edits.

- Created Mabel through the inline setup and observed the same native name in the workspace and sidebar.
- Opened Customize, Refine, and Folder under the composer. Root instructions and folder showed their supported read-only state.
- Opened the real retained child's transcript, observed `CHILD_PROOF_OK`, and returned to the parent with its draft intact and focus restored to the child button.
- Checked inline Customize at 390 × 844. Name, character gallery, and save action remained usable. Restored the normal viewport afterward.
- Removed the verification draft and left Mabel selected.

The header keeps 20px left padding with the sidebar visible, 54px when collapsed, and 48px at widths up to 720px to leave room for the sidebar control. These values are owned by a StyleX layout variable and the header's existing responsive rule. Vertical padding is zero; negative CSS padding is invalid.

`nub run typecheck` and `nub run lint:stylex` passed. This is HMR-verified UI work; no application build, automated browser suite, or Electron renderer restart was used.

## Remaining boundaries

- Existing root instructions and working directory cannot be changed live through the verified native API. Their controls explain the restriction. New roots can choose their folder before preparation.
- Import, explicit reset/fork, direct child messages, and child cancellation remain outside this implementation.
- Parent state uses the native event feed. An open read-only inspection refreshes every two seconds.
- Missing native files fail visibly and never create a blank replacement. Ambiguous legacy profiles require a root choice and preserve earlier independent sessions.

No commit or push was made.
