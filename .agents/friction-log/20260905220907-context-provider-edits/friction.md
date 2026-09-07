---
title: "Context-provider edits can leave the browser scenario blank during HMR"
severity: "minor"
---

### Expected Behavior

Context-provider edits keep the browser UI connected during HMR.

### Current Behavior

Editing agent-state.tsx or ui/message-scroller.tsx produced missing-provider errors and a blank browser scenario. Reloading the tab recovered it without restarting the development service host.

### Possible Solution

Investigate context identity across Zenbu injection consumers and React HMR.

### Minimal Reproducible Example

Run nub run dev, open the Agent scenario, and edit a context-provider module. Inspect browser errors after HMR.

### Context

Observed during the message-to-work UI implementation from main at 77002b4. Fresh browser loads worked.
