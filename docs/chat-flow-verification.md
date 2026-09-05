# Message-to-work verification

This record describes browser inspection of the implemented chat flow on 2026-09-05. Production components ran through the isolated Agent scenario at `http://127.0.0.1:4310/?browser=1&scenario=agents`. Fixtures were synthetic and did not send commands to live sessions.

## Observed behavior

| Scenario | Evidence |
| --- | --- |
| Empty Agent | Selecting Star in New Agent showed identity, role, workspace, and the shared bottom composer. One send created a conversation, displayed the message once, and showed accepted/working state |
| Creation rejection | Reject mutations kept the first message in the Agent draft with an error |
| Rejection after creation | Reject sends retained one created conversation and its message for retry |
| Retrying the first message | The retained text appeared once in the authoritative transcript; admission feedback and working activity appeared |
| Delayed admission and navigation | A four-second send remained in Robot’s original conversation after selecting Eyes; a later Robot draft survived admission |
| Queued follow-up | The composer reported Follow-up queued; expanded activity showed one queued item and its text |
| Stop | The stop control and working activity disappeared after the synthetic runtime became idle; no success badge appeared |
| Tool details | The Tool activity preset exposed textual read output and a separate bash tool error through nested disclosures |
| Concurrent activity | The roster preserved 2 working, 1 recovering, and 1 failed states together |
| Reconnection | The composer accepted draft text while send remained disabled |
| Narrow layout | At 390 and 320 CSS pixels, choosing an Agent opened its chat; the composer stayed within the viewport |
| Document overflow | At 320 CSS pixels, document scroll width and viewport width both measured 320 |
| Options focus | Escape closed Conversation options and restored focus to its trigger |
| Reading position | Switching away and back restored scrollTop 6146.5 in the same long transcript; jump-to-latest remained available |

## Static verification

TypeScript, the StyleX boundary, visible-outline lint, package dependency boundaries, and lat link validation passed during implementation. No automated tests, builds, desktop smoke checks, or Electron renderer launches were run for this UI work.

## Live profile and remaining limits

The live browser profile initially crashed because its roster selector accessed `app.roster` before database hydration. The selector now tolerates the missing initial namespace, and the live UI renders.

The shared Prime Agent daemon did not respond to its catalog list request within 30 seconds. Live admission, execution, and recovery therefore remain unverified in this session. The UI reports catalog unavailability. The shared daemon was not restarted, and no live prompt was sent to create verification evidence.

Context-provider edits produced two HMR identity errors during development. Reloading the browser recovered those pages while the development service host stayed alive. Ordinary component edits used HMR. This is browser evidence, not Electron verification.

Reduced-motion handling remains in the source and the scroller now honors it for smooth scrolling. Composition-input handling has a source guard. Neither OS-level input-method composition nor forced-colors rendering was exercised during this inspection.

## Reproduce the interaction

Use the scenario controls documented in [the workflow](workflow.md#chat-flow-scenarios). New Agent exercises first-message creation; Reject mutations and Reject sends isolate different failure stages. Slow sends permits editing and navigation before admission. Tool activity, Concurrent activity, Reconnect, and Long conversation provide the adverse presentation states above.

## Send recovery follow-up

The guarded-send change adds these checks to the earlier UI evidence:

- Browser HMR: a delivered prompt with a lost browser acknowledgement keeps its draft and exposes Check send. Recovery leaves one user message.
- Browser HMR: editing the draft before recovering the original send preserves the newer text, including identical text retyped as a new draft version.
- Browser HMR: a lost follow-up acknowledgement recovers with one queued item.
- HTTP integration: production chat coordination and receipt storage preserve identity across an actual dropped response. Concurrent callers share delivery. Preparation rejection allows a fresh retry; native uncertainty and a replacement receipt owner prevent redelivery. Explicit release permits a new send. The delivery endpoint is controlled fixture behavior, not a model execution claim.
- Isolated Zenbu/daemon integration: an uncertain native receipt survives renderer reconnect. A changed payload is refused, and the old epoch remains unknown after the service restarts. The fixture also reruns Agent persistence and daemon recovery checks.

The two focused integration tests passed. TypeScript, StyleX, visible-outline, dependency-boundary, and lat checks passed. No automated browser tests or builds ran. The shared live daemon was not restarted or used for prompts. Successful model execution and automatic resolution of native acknowledgement loss remain outside this evidence.

## Review corrections

The review identifies and fixes four failure paths:

- Receipt recovery previously called the send endpoint. If the original request never reached Ernie, Check send could dispatch it. The HTTP integration now drops that request, checks its receipt, and delivers the original late. Neither operation dispatches the message. An explicit fresh retry still works.
- A daemon disconnect disabled Check send. Browser HMR now confirms receipt recovery while the daemon is disconnected, with new sends disabled.
- Empty-Agent creation retained an old session ID after reassignment. Browser HMR now confirms that Star creates a fresh conversation after assigning its first conversation to Robot. The second transcript contains only the second message.
- Native attachment could use a logical ID before the catalog supplied its active ID. Snapshot filtering could then discard the beginning of the snapshot. The service resolves active identity before attachment and reserves concurrent acquisition. The real integration checks a shared generation across three concurrent callers, offline receipt inspection, and attachment after daemon restart.

These changes address the observed snapshot failure. The focused daemon integration passes after the fix; broader verification runs through the commit hook.
