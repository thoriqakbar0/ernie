---
title: 'Daemon restart integration check can lose snapshot framing'
severity: 'minor'
---

### Expected Behavior
The integration suite completes the isolated daemon restart check reliably.

### Current Behavior
The first pre-commit run failed with Snapshot ended before it began during Agent durability and recovery. All five integration tests passed on the next complete run.

### Possible Solution
Inspect snapshot framing while reconnecting after the fixture daemon restarts.

### Minimal Reproducible Example
Run nub run test:integration. The failure occurred once during the real Zenbu service boundary test; a deterministic reproduction is not established.

### Context
Observed while preparing commit fd80e54. The shared development runtime stayed alive. The PR records the intermittent failure.
