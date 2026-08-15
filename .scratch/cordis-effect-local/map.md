# Bring effect-local lifecycle cleanup to Ernie

Label: `wayfinder:map`

Status: open

## Destination

Ernie's production plugin host owns an effect-local lifecycle capability. Each context-mediated effect pairs acquisition with adjacent cleanup, and recovery is exactly once in reverse order across partial activation, disable, and host disposal.

The retained implementation passes repository checks, lands on `main`, and has verified GitHub signoff.

## Notes

- This map carries execution through the destination, overriding Wayfinder's planning-only default by explicit user choice.
- Call the scoped capability **effect-local lifecycle**. Do not claim full Cordis compatibility.
- Use `grilling` and `domain-modeling` for decision tickets.
- Use `coding-standards` for TypeScript contracts, async lifecycle behavior, typed failures, and tests.
- Use [the Cordis research note](../../research/cordis.md) as the source-backed starting point.
- Preserve Ernie's transactional publication of commands and views unless a resolved ticket deliberately replaces it.
- Treat expected cleanup failures as typed values and broken lifecycle invariants as defects.
- Claim a ticket by replacing `Assignee: unassigned` before working it.
- The local tracker uses each ticket's `Blocked by` field because it has no native dependency relationship.

## Decisions so far

<!-- Closed ticket decisions belong here as one linked gist each. -->

- [Effect-local lifecycle boundary](./issues/01-define-the-effect-local-lifecycle-boundary.md): one activation attempt owns every context-mediated plugin effect in a reverse-order ledger, drained exactly once on activation failure, disable, or host disposal.

## Not yet specified

- Additional plugin-owned resource families may become visible after the production-path prototype traces real acquisitions.
- Documentation and migration surfaces cannot be enumerated until the durable activation contract is chosen.

## Out of scope

- Service provision, service injection, reactive coeffects, or dependent-first provider teardown.
- Declarative configuration reconciliation or hot module replacement.
- Third-party plugin loading, permissions, signing, isolation, or sandboxing.
- Adding Cordis as a dependency or claiming API compatibility with Cordis.
- Creating a release tag or publishing a release.
