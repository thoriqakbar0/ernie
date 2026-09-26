---
title: 'Prime Agent release URLs block adding renderer dependencies'
severity: 'major'
issue: 'thoriqakbar0/ernie#41'
---

## Expected Behavior

Nub can add a renderer dependency.

## Current Behavior

Resolving the existing Prime Agent v0.8.1 tarballs fails: pub-728493de92a943e2a9b2d17b4719f318.r2.dev is unreachable. curl also cannot connect.

## Possible Solution

Restore reachability or publish durable release artifacts.

## Minimal Reproducible Example

Run nub add react-markdown. nub install --prefer-offline encounters the same unavailable existing dependency.

## Context

Markdown rendering is blocked. The uninstalled dependency declaration was removed. Existing runtime remains running.
