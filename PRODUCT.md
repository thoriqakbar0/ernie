# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are developers who run Prime Agent against a local code workspace. They need to start, revisit, monitor, interrupt, and continue agent sessions without losing the workspace or conversation context.

> Inferred from the current repository and the request for a full UI redesign. Confirm or revise this audience in later product work.

## Product Purpose

Ernie is a desktop-first Zenbu.js interface for Prime Agent. It gives developers a durable place to manage local agent conversations, choose a model, send work, follow progress, stop active work, and recover from connection failures.

Success means a developer can understand the current session state, act on it, and move between sessions without reading logs or thinking about the Electron, Zenbu, or daemon boundaries.

## Positioning

Ernie combines a direct conversational workspace with the real local Prime Agent runtime. The interface is not a mock chat surface: session state, model selection, transport recovery, and workspace location come from the production agent boundary.

## Operating Context

- The application runs as an Electron product and through a browser-first development loop.
- A session is anchored to a local working directory.
- Users can keep several sessions and switch between them.
- Prime Agent may be idle, working, recovering, reconnecting, or unavailable.
- The renderer receives authoritative `PrimeSessionSnapshot` data and uses Zenbu RPC and events in production.

## Capabilities and Constraints

- Preserve the existing session, snapshot, model, RPC, event, and workspace behavior.
- Preserve real session creation, selection, submission, follow-up, stop, and model-selection actions.
- The same production UI components must work in browser development and Electron.
- The sidebar and workspace can render in separate Zenbu views and synchronize selection.
- Do not add a second UI state model or fake production path.
- Empty, loading, ready, working, recovering, reconnecting, failed, and action-error states need visible recovery behavior.
- Use fully typed TypeScript. Do not introduce `any`.

## Brand Commitments

- Product name: Ernie.
- Preserve the existing Ernie mark and its recognizable navy, coral, and warm-white identity.
- Voice is calm, direct, practical, and developer-oriented.
- Avoid generic AI-dashboard styling and decorative futuristic effects.

## Evidence on Hand

- Product and development behavior: `README.md`.
- Current production UI: `src/renderer/components/`.
- Runtime state boundary: `src/renderer/prime-agent-state.tsx`.
- Product and integration tests: `src/renderer/tests/` and `cypress/e2e/`.
- Brand mark: `.build/renderer/ernie-logo.png`.
- Current workflow notes: `.codex/ernie-ui-loop/`.
- No customer quotes, usage metrics, pricing, or external product claims are available. Future UI work must not invent them.

## Product Principles

1. Keep the developer oriented: always show which workspace and session are active.
2. Make runtime state legible: working, recovery, and failure are product states, not hidden infrastructure details.
3. Keep action close to context: compose, stop, retry, and model selection belong where their effect is visible.
4. Preserve continuity: session switching must not blur drafts, messages, or current selection.
5. Prefer calm operational clarity over novelty.

## Accessibility & Inclusion

- All core flows must work with keyboard-only navigation.
- Controls need visible focus, accessible names, and non-color status cues.
- Dynamic runtime and error updates need appropriate live-region behavior.
- The interface must remain usable at 200% zoom and narrow window widths.
- Motion must respect `prefers-reduced-motion`.
