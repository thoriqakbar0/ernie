# Prime Agent 0.9.3 upgrade audit

Date: 2026-09-07

## Recommendation

Upgrade is worthwhile, but a dependency-only bump is not ready for runtime signoff. Resolve package delivery and daemon identity first. Roster subscriptions and direct transport are optional follow-up integrations, not prerequisites for retaining the existing conversation interface.

Baseline: Ernie `2bc9dfe`, installed Prime Agent `0.8.1`. Candidate: upstream tag `v0.9.3`, commit `915c78f42c248b08238dd27fcd4bcab32c60beab`, inspected at `/tmp/ernie-prime-agent-latest`. The existing Prime Agent feature checkout was preserved.

## Findings

| Priority | Evidence | Impact and required action |
| --- | --- | --- |
| High: dependency delivery | `package.json:37` and `package.json:50`; downloaded `prime-agent-0.9.3.tgz` package manifest | All four packages currently use R2 URLs. The R2 host failed a connection attempt in this environment. GitHub release downloads succeeded and all four SHA-256 hashes matched the release checksum file, but the main tarball still references its three companion packages through R2. Updating only the main URL is insufficient. Establish a reproducible resolution for the entire package family and regenerate the lockfile with Nub. Validate transitive resolution, not just top-level downloads. |
| High: daemon version ownership | `src/main/prime-agent/service.ts:1044` and `src/main/prime-agent/service.ts:1098` | The default socket is hard-coded as `prime-agent-v0.8.1.sock`. Connection accepts a hello without checking its schema or package version. Installing a new client can therefore reconnect to an existing old daemon. Define the intended managed-daemon version and endpoint policy, preserve saved roots, and surface unsupported external endpoints without replacing user-owned daemons. A new socket alone does not prove existing resident workers can be reopened safely. |
| Medium: roster freshness and scale | `src/main/prime-agent/service.ts:106`, `src/main/prime-agent/service.ts:148` | Ernie calls `list --all` every second. Upstream adds capability-gated `agent_roster` subscriptions and serves list results from a supervisor ledger. Existing polling still has a supported command path, but a package bump will not turn Ernie into a subscriber. When adopting subscriptions, retain a separate saved-session catalog path: the live roster is scoped to registered worker families and does not replace all saved sessions. |
| Medium: direct transport is opt-in through a different construction path | `src/main/prime-agent/service.ts:510`; upstream `packages/coding-agent/src/modes/agent-connection/daemon-agent-connection.ts:332` | Ernie constructs `new DaemonAgentConnection(...)` and later attaches. Upstream's static `DaemonAgentConnection.attach(...)` creates the routed/direct transport and handles fallback. Ernie will not gain that path automatically. Adopting it requires reviewing listener registration, initial snapshots, shared-client disposal, and Ernie's existing recovery owner. Secondary inspection should remain a separate watcher rather than taking over the primary transport. |
| Medium: subagent semantics | `src/renderer/components/sidebar.tsx:94`; upstream 0.9.2 changelog | Ernie displays direct child count. Upstream distinguishes a session's own work from busy descendants at any depth, and exposes additional worker freshness and usage information. Keep the current count explicitly direct, or add a separately defined recursive running count. Do not relabel the present value as all running descendants. These are product improvements, not demonstrated wire breakages. |

## Compatibility observations

- The daemon protocol stays at version 7; schema revision changes from 22 to 26. New roster and direct-transport commands are capability-gated. A matching protocol number alone does not establish feature availability.
- `SessionManager`, `DaemonClient`, `DaemonAgentConnection`, `AgentConnectionEvent`, and the runtime configuration entry points used by Ernie remain exported. No export rename was found at those boundaries.
- The saved session format remains version 3. The reviewed SessionManager changes add usage accounting; no mandatory saved-root format migration was identified. Real existing-root resume is still unverified.
- Prime Agent replaces its Jupyter/IPython kernel implementation with a CPython REPL. The tool still uses the name `ipython` and accepts code. Ernie already recognizes `ipython` and `python`; it does not directly instantiate the old kernel client.
- Upstream includes background output in the tool's text content as well as structured details. Ernie's current text projection can display it. Structured stdout/stderr/result presentation is an optional refinement, not a required fix for missing background text.
- New releases include GPT-6 Astra OAuth discovery, daemon process-identity fixes after timezone changes, and reliable cancellation of deep subagent trees. These are concrete reasons to update.

## Verification

Completed: upstream source and relevant diffs inspected; packaged dependency manifest inspected; four GitHub release tarballs downloaded to `/tmp/ernie-prime-093-audit`; all four checksums verified against release `SHA256SUMS`; current Ernie source and installed version checked.

Not verified: dependency installation, TypeScript against installed 0.9.3, fresh daemon startup, old/new daemon negotiation, existing-root resume, child inspection, reconnect, cancellation, Python execution, or browser behavior on 0.9.3. No tests, builds, live messages, daemon restarts, or dependency changes were performed for this audit.

## Upgrade sequence

1. Resolve and pin all four release packages with a reproducible lockfile.
2. Implement explicit managed-daemon version handling and capability checks for any new features.
3. Verify 0.9.3 in an isolated profile: create and reopen a root, inspect a child, exercise disconnect recovery, and inspect Python output. Use disposable fixtures and no production credentials.
4. Confirm the live-profile transition and saved-worker ownership before switching the current runtime.
5. Add roster subscriptions and direct transport separately if their behavior and performance benefits are desired.

The audit itself left application source, dependencies, and the active runtime unchanged.

## Implementation on `thor/prime-agent-093`

The isolated worktree at `/Users/thor/work/ernie-prime-093` now pins all four packages to the GitHub 0.9.3 release assets. Companion-package overrides also cover transitive references, and Nub regenerated the lockfile. Installation succeeded without lifecycle scripts. The existing checkout's dependencies and live runtime remain on 0.8.1.

Managed socket naming now follows the installed package version. Handshake validation checks the protocol, minimum schema, and managed package version before any session commands. An incompatible existing daemon is left running; Ernie closes its client and reports the mismatch. See [the architecture policy](architecture.md#prime-agent-version-boundary).

Verified against 0.9.3:

- TypeScript passes.
- Seven socket-level handshake scenarios pass, covering old versions, missing schema metadata, and unsupported protocol versions.
- Two logical attachments remain isolated on one daemon client.
- Saved instructions survive restart and native resume within 0.9.3.
- The real Zenbu service boundary passes durability, reconciliation, receipt recovery, and attachment recovery checks.
- External daemon ownership assertions passed, but the original launcher left a fixture host alive and required manual cleanup. A proposed direct-Node launcher change failed readiness on rerun and was reverted. This case is not a clean unattended pass; the fixture issue is recorded in the friction log.

Not verified: resuming an actual 0.8.1 worker in a 0.9.3 process, Python kernel execution, live provider calls, or switching the running application. Roster subscriptions and direct transport remain separate follow-up work. No release build was run.
