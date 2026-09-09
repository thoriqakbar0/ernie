# Ernie consolidation on main

`main` in `/Users/thor/work/ernie` is the canonical checkout. Commit `25458ea` contains the reconciled UI from PR #59; its tree exactly matches `3edab76`. Later work is reconciled as deltas below. Older branches and worktrees remain recovery material.

## Reconciled changes

- Preserve the merged model settings, roster actions, keyboard navigation, browser artwork, and parent-owned browser workspaces.
- Apply `6072` release/history fixes, native name-collision handling, model selection before sending, and temporary update opt-in.
- Apply only the `df97` changes after recovery snapshot `e177d3e`: production profiles, bundled Ernie skills, the short native host-awareness prompt, and production iteration guidance.
- Preserve the everyday app’s composer changes: primary Steer during work, a separate stop control, and no Queue control. Existing queued daemon messages remain intact.
- Show the selected folder basename, retain its full path in the accessible label and tooltip, and provide a clear control. Without a custom selection, show Choose folder.
- Capture bundled skills and docs when present while allowing older source checkpoints that predate them to restore.
- Expand unsupported StyleX border and text-decoration shorthands, preserve keyboard focus with shadow rings, and reopen run sections synchronously when work starts.

## Worktree audit

The September 9 audit covered all 17 worktrees. Snapshots preserve tracked edits and non-ignored source files without changing their original indexes or checkouts. Ignored data, sessions, dependencies, profiles, and generated artifacts remain on disk.

| Worktree | Decision | Recovery commit |
| --- | --- | --- |
| `/Users/thor/work/ernie` | Canonical `main`; clean before consolidation | `07ba0e7` |
| `/private/tmp/ernie-site-publish-20260909` | Separate website task; retain its pushes on main | `faa0131` |
| `/Users/thor/.codex/worktrees/6072/ernie` | Reconcile current runtime and release fixes | `5f2abc3` |
| `/Users/thor/.codex/worktrees/df97/ernie` | Reconcile delta from `e177d3e`, including untracked skills | `d356e96` |
| `/Users/thor/.codex/worktrees/d888/ernie` | Clean older UI source; superseded by PR #59 | `5b5cab3` |
| `/Users/thor/.codex/worktrees/e720/ernie` | Browser illustration already in the merged UI | `643b264` |
| `/Users/thor/.t3/worktrees/ernie/t3code-3db39cb0` | Merged source; retain dependency symlink | `e261567` |
| `/Users/thor/.t3/worktrees/ernie/t3code-7d050eba` | Preserve retired plugin-host experiments | `5dc6faf` |
| `/Users/thor/.t3/worktrees/ernie/t3code-83b94953` | Preserve retired Lynx host adaptation | `e9a027f` |
| `/Users/thor/.t3/worktrees/ernie/t3code-bf00f7dc` | Clean, already merged | `ac2d77e` |
| `/Users/thor/.t3/worktrees/ernie/t3code-fix-past-day-review` | Preserve retired Electron bridge, feed, and UI-control fixes | `1f7e171` |
| `/Users/thor/work/.worktrees/ernie/agent-roster` | Clean, already merged | `3e5be74` |
| `/Users/thor/work/.worktrees/ernie/feat-more-prime-agent-rpc-compat` | Synchronization replaced by current service; retain friction note | `5e2f11d` |
| `/Users/thor/work/.worktrees/ernie/feat-prime-agent-session` | Clean, already merged | `a5f6f1f` |
| `/Users/thor/work/.worktrees/ernie/refactor-zod-to-effect-schema` | Effect migration squashed into main as `123ba3e`; retain local artifact | `d32c168` |
| `/Users/thor/work/.worktrees/ernie/ui` | Exact tree merged as PR #59; retain `work/` and Planner Test data | `3edab76` |
| `/Users/thor/work/ernie-prime-093` | Clean, already merged | `985f916` |

The older plugin, Lynx, and Electron bridge owners were removed by the Zenbu restart in `6863f61`. Reintroducing their old files would restore a second architecture. Their code remains recoverable in the snapshots above. The current app uses Zenbu services, the native Prime Agent protocol, and local development annotation tools.

## Branch recovery

The audit also inventories local branch refs and compares unmerged patches. Historical GPUI, Cordis, scriptable-interface research, old website designs, and retired UI experiments remain on their branches. They are preserved work, not enabled features in the current Electron app. Squashed and superseded branch heads must not be merged wholesale.

The original remote recovery snapshots remain `backup/ernie-ui-canonical-20260909` at `60ff0ee` and `backup/ernie-ui-refinements-20260909` at `e177d3e`. New local snapshots use `backup/consolidation-20260909-*`. The inventory, patches, and repository bundle are retained under `/Users/thor/Library/Application Support/Ernie Local Backups/20260909-main-consolidation`.

## Runtime boundary

Use one everyday `/Applications/Ernie.app`, with editable source at `/Users/thor/.zenbu/apps/ernie` and history at `/Users/thor/.ernie/app-history`. A recovery parent and editable child are processes within that app. Keep the existing database, Chromium profile, native sessions, credentials, and daemon.

The separate test app and `production-0.2.1-test` profile remain closed and preserved. Source checks do not prove that the app loaded an edit. Verify the installed source against the consolidated commit and confirm host startup readiness after installation. Record native visual inspection separately when computer access succeeds.
