---
name: ernie-skill
description: Work within an Ernie-started Prime Agent session. Use for Ernie app customization, runtime/profile identification, app-history recovery, or deciding how an Ernie-hosted task should interact with the application.
---

# Work through Ernie

Treat the user's selected workspace and conversation as the task boundary. Ernie is the host; ordinary project work does not imply permission to modify Ernie itself.

## Ordinary workspace work

Follow the user's request and workspace instructions. Preserve drafts and unrelated changes. Use existing session tools and report actual results. Do not create another Ernie instance, change profiles, or alter global Prime configuration to complete a project task.

## Change Ernie

Read [iterate-ernie](../iterate-ernie/SKILL.md) before editing Ernie's UI or Zenbu layer. Identify the running production app and active managed source first. A repository path or matching version label does not prove runtime identity.

Use the bundled Editing Ernie guide and history.status when editing managed source. Register and finish customization capture through the host. Preserve all conversation data, profiles and history. Recovery approval belongs to the host; do not bypass it with filesystem changes.

## Diagnose a failed interaction

Read the actual error and current state before retrying. Distinguish a confirmed rejection from an unknown send outcome. Never resend an ambiguously accepted message automatically. Connection to a daemon does not prove a provider is authenticated or that its model is usable.

Own complete interactions rather than isolated labels. For UI changes, inspect the visible result and exercise the affected action before claiming success. State a concrete verification blocker if live access is unavailable.

## Instruction scope

Ernie may append a pointer to this skill using native appendSystemPrompt. Preserve the user's Agent instructions and the runtime's existing system prompt. These instructions apply to sessions configured by Ernie; do not install or edit global Prime Agent prompts. Follow higher-priority instructions and the user's current task.
