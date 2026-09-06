---
title: 'External daemon integration fixture can outlive its launcher'
severity: 'minor'
---

## Expected Behavior
The external daemon integration test exits after fixture cleanup.

## Current Behavior
The test launched a Nub wrapper and signalled that wrapper, leaving the Node development host alive. Assertions passed but the test process retained open pipes.

## Possible Solution
Own the Node host directly and verify teardown completes. A subsequent isolated rerun also needs investigation before claiming a clean pass.

## Minimal Reproducible Example
Run the external daemon ownership case in src/integration/prime-agent-daemon.integration.test.ts.

## Context
Observed while verifying the Prime Agent 0.9.3 upgrade in an isolated worktree.
