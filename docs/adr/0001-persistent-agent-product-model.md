# ADR 0001: Persistent Agents

Accepted September 5, 2026. The multiple-conversation ownership model was superseded by [ADR 0002](0002-native-agent-roots.md) on September 7.

## Original decision

Give Agents durable identity and roles, with several conversations beneath each Agent. Ernie would own organization; Prime Agent would own execution, transcripts, and recovery. This replaced flat session navigation so users could return to an Agent's role across work sessions.

## Alternatives and consequences

Flat session navigation lacked persistent roles. Renaming sessions alone did not establish the proposed lifetime. Starting with autonomous coordination would require scheduling and context-sharing rules before identity was settled.

The decision required stable Agent IDs, preserved session origins, and an explicit aggregation policy for concurrent activity. ADR 0002 later simplified ownership to one native root per Agent while preserving legacy session files.

## Deferred capabilities

Memory, routines, isolated workspaces, task surfaces, and cross-Agent coordination need separate persistence and authority decisions. Persistent identity does not imply continuous execution or permission to act. Runtime evidence remains authoritative for progress and completion.
