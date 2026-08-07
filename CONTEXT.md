# Domain Language

## Workspace

The complete Ernie work area visible in one window. A workspace contains worktrees, open tabs, and one worktree manager.

## Worktree

A Git checkout that provides an isolated working directory for one or more Prime Agent sessions. A worktree remains visible after its current agent becomes idle or completes.

## Nested worktree

A worktree created in the context of another worktree. Nesting expresses delegation and ownership, not necessarily filesystem containment.

## Agent

A Prime Agent session operating within one worktree. Root agents and subagents share the same concept; their parent relationship determines the visible hierarchy.

## Worktree manager

The workspace-level agent responsible for creating, locating, switching, and retiring worktrees. It is always reachable from the bottom of the sidebar and is not itself presented as a worktree.

## Surface

A view opened within a worktree. The supported surface kinds are chat, Markdown, and browser.

## Tab

An open view onto one surface. Tabs may belong to different worktrees. Opening or closing a tab does not start, stop, or delete its agent or worktree.

## Chat surface

The conversation and structured activity timeline for one agent.

## Activity block

A structured unit of agent work such as a tool execution, delegation, agent message, compaction, retry, or failure. Activity blocks are owned by an agent and remain ordered within its chat surface.
