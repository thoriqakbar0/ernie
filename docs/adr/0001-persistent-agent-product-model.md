# ADR 0001: Organize Ernie around persistent Agents

Ernie will organize work around persistent Agents. Each Agent can have several conversations, with Prime Agent sessions responsible for execution.

## Status

Accepted on 2026-09-05. This record describes the target product model; it does not claim that implementation is complete.

## Context

Ernie currently presents a list of Prime Agent sessions. Developers select a session to read its transcript, send work, and follow execution in a local workspace.

A session records a conversation, but it does not establish a role that continues across conversations. Giving a session a name or avatar would leave that limitation intact.

[Grok Bot’s design](https://x.ai/news/designing-grok-bot) makes persistent agents the main navigation objects. Chats, tools, artifacts, and routines support each agent’s work. Ernie adopts this product direction while retaining its real Prime Agent integration. The article describes product design, not Grok Bot’s internal architecture.

## Decision

An Agent has a durable identity and role, with a default workspace and model. It remains available when a conversation ends or another begins.

The main navigation shows an Agent roster. Selecting an Agent opens its latest conversation by default, with earlier conversations available within the same Agent.

Ernie owns the Agent record and its relationship to conversations. Prime Agent remains responsible for session execution, transcript data, and runtime state. Initially, each conversation corresponds to one Prime Agent session.

### Ownership

The product distinguishes identity, interaction, execution, and output:

| Concept | Responsibility |
| --- | --- |
| Agent | Persistent identity, role, defaults, and related conversations |
| Conversation | Messages and interactions with an Agent |
| Prime Agent session | Execution, authoritative transcript, runtime state, and recovery |
| Workspace | Directory or environment where session work occurs |
| Activity | Visible account of execution from runtime events |
| Artifact | Durable output, such as a document, design, code change, or dataset |
| Task surface | Task-specific interface beside a conversation |
| Routine | Scheduled or event-triggered work assigned to an Agent |

Tools and reusable skills can serve several Agents. When memory and routines become available, they belong to the Agent whose role they support. Shared capabilities do not imply shared memory or permission to act.

### Interaction

The roster identifies each Agent and shows its verified state. Current activity offers a way to inspect work without requiring continuous supervision.

Conversations can include messages, activity, artifacts, and interactive objects. Task surfaces provide more space when the work requires it. Both remain associated with the Agent and the relevant conversation.

An Agent workspace can later support a preview and explicit takeover. Until Ernie owns an isolated environment, the interface describes the local workspace without implying a separate computer.

### Runtime constraints

Prime Agent snapshots and events remain the source of truth for execution. The Agent layer must preserve submission, follow-up, stop, model selection, session synchronization, and recovery behavior.

Ernie must not infer progress, permission requests, blocked states, or completion from animation or elapsed time. Presence can display those states only when authoritative runtime data supports them.

Persistent identity does not imply continuous execution or cross-conversation memory. Routines require durable scheduling and work admission before the interface can promise unattended work.

## Consequences

Developers can return to an Agent’s role and related work across several conversations. Conversation history remains useful without defining the lifetime of the Agent.

Ernie must persist stable Agent identifiers and session associations. It must also define how existing sessions enter the new model without losing history or workspace context.

Several active sessions can belong to one Agent. Roster presence therefore needs an explicit aggregation policy that preserves failures and requests for attention.

The additional ownership model creates implementation work beyond a sidebar redesign. Memory, routines, isolated environments, and coordination each need their own runtime and persistence decisions.

## Adoption

The first implementation establishes persistent identity, an Agent roster, grouped conversations, truthful presence, and access to durable outputs. It uses real Prime Agent sessions throughout.

Later work can add richer artifact presentation, task surfaces, workspace preview, and routines. Coordinator Agents and group conversations follow once context sharing and work admission have defined boundaries.

## Alternatives considered

The decision rejects these approaches:

- **Keep flat session navigation**: preserves the current interface but leaves persistent roles outside the product model
- **Rename sessions to Agents**: changes presentation without separating identity from conversation lifetime
- **Begin with autonomous coordination**: introduces scheduling and context-sharing requirements before durable Agent ownership exists

## Open decisions

Implementation must resolve the following without changing the ownership model:

- Agent storage and association of existing sessions
- Presence when several sessions run, fail, or need attention
- Memory scope, retention, and explicit sharing
- Routine scheduling, cancellation, recovery, and action authority
- Workspace isolation and takeover behavior
- Context exchange between Agents

This record does not prescribe a database schema, avatar design, scheduler, or coordination protocol. It does not change the Prime Agent protocol, Zenbu service topology, or existing session recovery contracts.
