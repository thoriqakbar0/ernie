# Native Agent integration plan

Status: implemented locally, 2026-09-07. See [verification](native-agent-verification.md) for evidence and remaining limits.

## Decision

One Agent in Ernie represents one native Prime Agent root session. Its messages continue that root's context. Prime Agent owns subagent creation and the parent–child relationship. Ernie displays and controls the existing runtime.

This changes ADR 0001, which currently gives each Ernie Agent multiple independent conversation sessions. [ADR 0002](adr/0002-native-agent-roots.md) now supersedes that ownership decision.

## Evidence

- [Prime Agent README](../node_modules/prime-agent/README.md) exposes attach, rename, send, and stop commands for native agents.
- [Daemon architecture](../node_modules/prime-agent/docs/daemon.md) assigns one root session tree, kernels, and descendants to a resident worker. UI detachment does not stop it. Root replacement can preserve the active worker ID while changing the underlying session.
- [RLM model](../node_modules/prime-agent/docs/rlm.md) documents child admission, independent child contexts, inherited configuration, explicit replies, and retained child restoration. Admission is not completion.
- Ernie already projects `PrimeRlmChild` and useful parent metadata, but its catalog summary lacks root/child classification. Reuse these contracts and the existing attachment/event feed.

## Ownership

| Value | Owner |
| --- | --- |
| Root name, transcript, execution, configuration, children | Prime Agent |
| Avatar seed, favorites, presentation order | Ernie, keyed by durable native identity |
| Selected root or child, open settings section | Ernie UI |
| Unsent input and send receipts | Existing Ernie draft and receipt owners |

Names are labels, never join keys. Keep the persisted session ID separate from the active worker ID and child registry ID. Resolve the current active target at the runtime boundary. Do not use a worker ID alone as durable identity.

## User flow

1. Add Agent opens the empty-state setup inside the workspace.
2. Suggest a name from `names.ts`; let the user change it. Create one native root through an idempotent request, then attach it.
3. Show the same native name in the sidebar, workspace, and Prime Agent. Rename through Prime Agent and publish its returned state. External renames update Ernie.
4. Sending continues the selected root. Remove the routine New conversation action and the many-conversations-per-Agent selection behavior.
5. Show runtime-created children beneath their parent, with name and authoritative status. Opening a child inspects its own transcript; Back to Agent returns to the root and its preserved draft.
6. Keep Customize (identity), Refine (instructions), and folder controls in the empty state. Show changed configuration only when the native operation has confirmed it.

```text
sidebar                  workspace
Mabel                    Mabel
Ollie                    what's next?              avatar
                         [ message Mabel...             ]
                         Customize  Refine  Folder

                         Subagents                    2
                         auth-reviewer        running  >
                         test-reviewer        done     >
```

Subagents appear only after native admission. A done child does not imply that its result reached the parent. Show reply/receipt state separately when supplied by the runtime. Start with child inspection; direct messaging and child cancellation require verified native targeting before exposing actions.

## Delivery sequence

### 1. Verify native identity and capability boundaries

Inspect a disposable root and child through the existing daemon connection. Record durable IDs, active IDs, parent/root references, roster capabilities, rename responses, and recovery behavior. Verify whether instruction and working-directory changes can affect the existing root safely. Keep unavailable capabilities explicit.

Acceptance: the adapter can identify a root and its retained children after detach, supervisor recovery, and worker restoration without using names to join records.

### 2. Establish one native root per Agent

Introduce explicit unbound, creating, bound, and unavailable states. Keep creation request identity across uncertain outcomes, including failure after native creation but before Ernie metadata is saved. Replace conversation creation on first send with ensure-root-and-send. Native state owns the name; Ernie stores presentation metadata.

Acceptance: duplicate clicks, retry, navigation, and reconnect cannot create a second root or duplicate the first message. A rename collision keeps the existing name and offers a new suggestion; do not quietly create numbered conversation identities.

### 3. Convert navigation and settings

List roots in the sidebar. Route selection directly to the native root. Remove conversation reassignment and routine fresh-session controls from the normal Agent flow. Preserve send, follow-up, stop, model selection, and receipt recovery. External changes refresh from native events/catalog state.

Refine and folder edits must reflect native capability: apply supported live changes through native commands; otherwise keep the control read-only with an explanation until an explicit reset workflow is designed. Never claim an existing root changed based only on an Ernie defaults record.

### 4. Add the native subagent view

Use `PrimeRlmChild`, native parent references, and the existing event stream. Display queued, running, done, error, and cancelled states. Child selection uses a distinct draft key and transcript. Parent switching does not stop work. Show recovery and unsupported roster access distinctly from an empty child list.

### 5. Preserve existing data and verify

Inventory legacy Agent-to-session associations before migration. Preserve every JSONL session and immutable origin. A record with one session can bind directly. A record with multiple sessions needs an explicit choice of primary root; retain the others in an import/recovery view until the user chooses their disposition. Never classify old independent sessions as children.

Verify the native contract with disposable daemon integration fixtures, then the real UI through browser integration coverage and HMR review. Do not run builds or restart the Electron renderer for this planning task.

## Failure and accessibility contract

- Creation/rename failure: keep input, show an actionable error, allow retry with the same request identity.
- Missing native root: show unavailable/reconnect; never replace it silently with a blank root.
- Partial child roster: retain last known data with a stale marker; never present it as current.
- Cancel settings: retain the conversation draft and return focus to the opening control.
- Sidebar selection and child inspection work by keyboard. Announce state changes without moving focus. On narrow screens, inspect one root/child at a time and retain an explicit return control.
- Animations are cosmetic, with reduced-motion support.

## Open decisions and gates

- Legacy multi-session migration: choose a primary root per record; preserve the rest before any automatic migration.
- Native root replacement (`new`, fork, import) identity: do not expose reset/fork in the first slice. Define avatar/favorite transfer explicitly before adding these actions.
- Live instructions/folder updates: verify supported commands before committing UI semantics.
- Existing externally created roots: recommend an explicit import picker, preserving native names and configuration.

The first implementation slice is native identity binding plus create/select/rename. Subagent inspection follows on that foundation. Existing UI refinements remain separate from this planned model change.

## Implementation notes

The identity binding, create/select/rename, inline settings, explicit legacy migration, and read-only child inspection are implemented. Bound instructions and folder remain fixed because live mutation has not been established. External root import and reset/fork remain future decisions.

The two renderer typing issues found during planning are resolved. Verification and runtime limitations are recorded separately in [native Agent verification](native-agent-verification.md).
