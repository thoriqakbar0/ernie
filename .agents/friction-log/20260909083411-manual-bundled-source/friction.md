---
title: 'Manual bundled-source installation shows an update-check failure'
severity: 'minor'
---

## Expected Behavior
An installed local candidate explains update availability without a generic startup failure notice.

## Current Behavior
The connected installed workspace showed an update-check failure. Remote source publication was not part of this local installation.

## Possible Solution
Verify the updater contract for materialized bundled source without Git metadata and distinguish unsupported local candidates from network failures.

## Minimal Reproducible Example
Build origin/main 25458ea with release:build, install the app and bundled official-source, launch, and inspect the update footer after its startup check.

## Context
Observed on September 9 during local ad-hoc installation. Preserve profile data. Do not publish source solely to clear the notice.
