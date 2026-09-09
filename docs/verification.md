# Verification

Use [workflow](workflow.md#browser-scenarios) for browser reproduction and [AGENTS.md](../AGENTS.md#ui-iteration) for permission limits. Keep run-specific results in the task or PR instead of adding another dated verification document.

## Integration boundaries

| Boundary | Coverage source |
| --- | --- |
| Daemon compatibility without replacing peers | [Handshake integration](../src/integration/prime-daemon-handshake.integration.test.ts) |
| Native identity, root durability, isolation, and restart recovery | [Daemon integration](../src/integration/prime-agent-daemon.integration.test.ts) |
| Lost HTTP acknowledgements and retry identity | [Send recovery integration](../src/integration/send-recovery.integration.test.ts) |
| Real browser and Electron journeys | [Cypress scenarios](../cypress/e2e/) |
| Unused source and dependencies | `nub run lint:unused` |

Run only the checks appropriate to the change. Fixture coverage does not establish model inference, native picker behavior, or accessibility speech. HMR evidence does not establish packaged Electron behavior.

## Known limits

- Prime Agent 0.9.3 has passed isolated handshake, root persistence, and recovery checks. Actual 0.8.1 worker migration, Python execution, provider inference, and release builds remain unverified for that upgrade.
- The external-daemon fixture passed ownership assertions but required manual child-process cleanup. See the [friction log](../.agents/friction-log/20260907035311-external-daemon-integration/friction.md).
- Earlier UI inspections covered light-theme desktop and narrow layouts. They do not establish current VoiceOver, zoom, dark-mode, forced-color, or input-method coverage.
- Old scenario records exercised the superseded multiple-conversation model. Reproduce native-root behavior before relying on those results.

## Open interface findings

These September 7, 2026 findings need reproduction before implementation or closure:

- Prepared and legacy Agents may become unreachable under active-root filtering.
- Active parents show child counts but may lack an action to inspect the child transcript.
- Transcript Markdown lacks semantic lists, headings, fenced code, and links.
- Closing settings opened from the header can return focus to the document body.
- Creation instructions have an unexplained short input limit.
- Numbered avatar labels do not describe the visual choice.
- Roster fixtures without native roots can be filtered out, invalidating populated-state checks.
