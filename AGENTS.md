# Ernie agent instructions

Repository-specific rules supplement global guidance. Explicit user requests take precedence. The verification and signoff exceptions below apply to Ernie.

## UI iteration

- for interface requests, first inspect the live page and interact with the affected controls. Use [the interface workflow](docs/workflow.md#interface-iteration) for Agentation feedback, tool access, and visual verification.

- for Ernie UI and Zenbu iteration, use [iterate-ernie](.agents/skills/iterate-ernie/SKILL.md). Use the current production instance unless development is explicitly requested; keep one user-facing instance.
- run builds, automated tests, or smoke checks for UI work only when Thoriq asks.
- launch or restart the Electron renderer for UI work only when Thoriq asks.
- report UI work as HMR-verified; claim build verification only when performed.

## Development

- use Nub for dependency installation, TypeScript execution, and package scripts; preserve the embedded pnpm toolchain for installed apps.
- use Nub's `--node` mode when starting Electron directly.
- preserve precise types; never use `any`.
- run `nub run link` after changes when Zenbu types have not synchronized automatically.
- run `nub run db:generate` after schema changes.
- update database state through the replica for immediate updates; avoid an RPC round trip solely to update a replica.
- prefer one component per file.

### React with Zenbu

- when writing or reviewing React components backed by Zenbu, read [Vercel composition patterns](docs/agent-guides/vercel-composition-patterns.md) and [React best practices](docs/agent-guides/react-best-practices.md).
- keep synchronized domain data owned by Zenbu's existing replica/service boundary; local React state owns transient interaction and unsaved input. Inspect installed APIs before introducing another data cache or provider.
- derive values from existing state when possible. Group fields that transition together when this prevents invalid combinations; do not consolidate independent state merely to reduce hook counts.
- apply composition at actual shared boundaries. Avoid adding contexts or compound components to a single consumer without a concrete need. Apply React rules relevant to this Electron/Vite app; Next.js-specific patterns do not imply a stack migration.

## Verification

- do not run, install, or require `gh signoff` in this repository.
- do not create or retain unit tests, including assertions about UI copy, labels, CSS classes, or selectors.
- when testing is in scope, verify user behavior through browser integration tests and daemon contracts through integration tests.
- UI verification follows the explicit opt-in rules above.

## Code knowledge

- never use `codedb` in this repository.
- run `lat search` before non-trivial work or broad source searches; use `lat section` and `lat refs` to follow code links.
- resolve user-supplied `[[refs]]` with `lat expand`.
- use `rg` when the graph lacks detail. If semantic search lacks credentials, report that and use `lat locate`.
- before editing `lat.md/`, read [.agents/skills/lat-md/SKILL.md](.agents/skills/lat-md/SKILL.md).
- update `lat.md/` for durable discoveries and changes to behavior, architecture, or tests.
- run `lat check` before finishing every task.
- for command syntax or search credential setup, read [lat usage](docs/reference/lat-usage.md).

## Read when relevant

- UI implementation or refinement: [UI guidance](docs/ui.md) and [workflow](docs/workflow.md).
- state ownership, component boundaries, or runtime integration: [architecture](docs/architecture.md).
- session data, synchronization, command payloads, or state lifetime: [data structures](docs/data-structures.md).
- product-model changes: [ADR 0002](docs/adr/0002-native-agent-roots.md); distinguish its target model from implemented behavior.
- Zenbu services, RPC, database, plugins, views, or packaging: [upstream snapshot](docs/reference/zenbu-snapshot.md). Verify against installed APIs.
- update the document owning a changed rule; link to it instead of duplicating guidance.

- Prime Agent lifecycle, protocol, or capability changes: [daemon boundary](docs/prime-agent/README.md).

## Friction

- run `nub dlx frog list` before work to see known project friction.
- log project papercuts with `nub dlx frog log`; exclude global, system, and internal friction.
