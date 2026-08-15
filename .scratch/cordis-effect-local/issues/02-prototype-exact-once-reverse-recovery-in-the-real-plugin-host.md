# Prototype exact-once reverse recovery in the real plugin host

Parent: [Bring effect-local lifecycle cleanup to Ernie](../map.md)

Label: `wayfinder:prototype`

Assignee: unassigned

Status: open

Blocked by: none

## Question

Which smallest production-path prototype proves that partial asynchronous activation recovers every acquired effect exactly once in reverse order while preserving transactional command and view publication?
