# Upstream daemon

This page summarizes the installed Prime Agent 0.9.3 package. Upstream support is broader than Ernie's integration. Consult the installed declarations for exact request fields and capability requirements.

## Process ownership

The supervisor owns public local sockets, routing, attachments, worker health, command journals, and coordinated updates. A catalog subprocess handles saved-session scans and inactive-file operations. Each worker owns one active root tree, its runtime, scheduler, tools, kernels, and RLM descendants.

Resident workers survive client detachment. Client-owned workers serve ephemeral clients with bounded cleanup behavior. Native shutdown affects the supervisor and workers; it is a different operation from disposing a client connection.

## Protocol and attachment

The public socket uses JSONL. The installed declarations expose versioned commands, stable identities, capability negotiation, snapshots, and generation-aware event cursors. Protocol version and schema revision are independent compatibility dimensions.

`DaemonAgentConnection` is a TypeScript client adapter, not the wire protocol itself. It assembles snapshots, updates its local cache, filters duplicate/retired events, and emits connection or session events to callers. Its operations cover more than Ernie's service currently projects.

A replay cursor belongs to a worker generation. Missing replay can be repaired with a coherent snapshot. Attachment-local backpressure prevents a slow consumer from requiring an unbounded queue for every other consumer.

## Mutation recovery

The upstream guide describes command journals keyed by client and command ID. Completed commands return stored results; uncertain dispatched mutations are reported rather than blindly replayed. This requires the appropriate client protocol/recovery path. An application must inspect its actual adapter configuration before claiming those guarantees.

Worker recovery and coordinated updates are native responsibilities. Update preparation checkpoints resident workers before committing shutdown; failed preparation leaves roots running. These native daemon updates are separate from Ernie application distribution.

## Capability families

The installed protocol and connection API include session discovery and lifecycle, prompting/steering/follow-up, queue management, model/thinking configuration, transcript/context inspection, compaction, bash, import/export, RLM child operations, agent messaging, schedules, heartbeats, and extension UI exchanges.

Some operations are internal, capability-gated, or require explicit ownership. Treat an exported command as an integration candidate, not automatic permission or evidence of an Ernie UI feature. See the [capability map](capabilities.md).

## Source precedence

Use installed `dist/modes/daemon/daemon-protocol.d.ts` and adapter implementation for exact protocol claims. Use bundled `docs/daemon.md` and `docs/agent-connection.md` for architecture. The package guide's v4 heading is stale relative to its protocol-7 declarations; neither a copied guide nor a dependency pin proves the live server version.
