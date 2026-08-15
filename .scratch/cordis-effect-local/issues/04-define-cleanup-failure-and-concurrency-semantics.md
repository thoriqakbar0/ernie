# Define cleanup failure and concurrency semantics

Parent: [Bring effect-local lifecycle cleanup to Ernie](../map.md)

Label: `wayfinder:grilling`

Assignee: unassigned

Status: open

Blocked by: [Prototype EffectScope through Ernie's production extension host](./02-prototype-exact-once-reverse-recovery-in-the-real-plugin-host.md)

## Question

What observable guarantees govern cleanup failures, multiple inverses, disable during activation, concurrent lifecycle requests, and host disposal?
