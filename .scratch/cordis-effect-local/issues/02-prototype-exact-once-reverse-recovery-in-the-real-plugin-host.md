# Prototype EffectScope through Ernie's production extension host

Parent: [Bring effect-local lifecycle cleanup to Ernie](../map.md)

Label: `wayfinder:prototype`

Assignee: codex

Status: open

Blocked by: none

## Question

Which smallest production-path prototype proves that an `EffectScope` can replace the built-in extension host's lifecycle core, recover partial asynchronous activation exactly once in reverse order, and preserve transactional command and view publication?
