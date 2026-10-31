---
title: 'Assignment search has no empty-result recovery'
severity: 'minor'
issue: 'thoriqakbar0/ernie#40'
---

## Expected Behavior

An assignment search with no matches explains the result and provides a clear action that restores search focus.

## Current Behavior

The menu showed only Unassigned history when no Agent matched.

## Possible Solution

Fixed locally in AgentWorkspaceHeader: add a status message and Clear search with input focus restoration.

## Minimal Reproducible Example

Open the agents development scenario, then Conversation options, Assign conversation, and search for no-such-agent.

## Context

Browser inspection on 2026-09-06. The fix passed browser HMR inspection, keyboard clearing, and Escape focus restoration.
