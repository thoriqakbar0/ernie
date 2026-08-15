# Ernie UI capability harness

Status: ready-for-agent

## Problem Statement

Ernie has a small local CLI that can focus the application, change its theme, and control its sidebar. This surface is useful, but each command is wired manually across argument parsing, help text, socket validation, main-process dispatch, renderer events, success text, and tests. Adding another command requires changing several separate representations of the same behavior.

People and agents cannot discover Ernie's available UI controls as data. They also cannot inspect the corresponding UI state. Existing mutations report success after the main process dispatches an event, without proving that the owning UI applied and persisted the requested state. An agent therefore lacks the small, reliable operations needed to inspect, act, verify, loop, and compose its own solution.

The desired system is not a task-specific agent scaffold, workflow engine, or natural-language UI controller. Ernie should expose a Herdr-like action language made of typed, discoverable UI capabilities. An RLM or other agent can then decide how to combine those capabilities through its normal shell or code environment.

## Solution

Turn the existing UI-control CLI into an extensible UI capability harness. Each built-in feature registers one typed UI capability that declares its identity, description, command grammar, validated inputs, inspectable state, result contract, availability, and handlers. Ernie derives CLI parsing, nested help, the Capability manifest, request validation, and success rendering from those definitions instead of maintaining parallel command descriptions.

Preserve the existing `ernie ui` commands and their valid arguments. Add discovery and inspection operations so a person or agent can learn the available action language and observe current UI state. Every successful mutation must wait for the owning capability to apply the change and return state that proves the requested postcondition. Every request returns one stable UI control result envelope containing typed capability data or a structured error.

Built-in capabilities register during application startup in the first release. The design reserves an explicit automation contribution for plugins, but runtime plugin registration is deferred. Ordinary plugin commands never become public CLI controls automatically.

The CLI remains a local client of the running Ernie application. It does not manage agents, choose workflows, or interpret user intent. The caller composes the available UI capabilities.

## User Stories

1. As an Ernie user, I want existing UI commands to keep working, so that this redesign does not interrupt my workflow.
2. As an Ernie user, I want command help to list the current UI capabilities, so that I can learn the available controls.
3. As an Ernie user, I want nested help for each command group, so that I can understand arguments without reading source code.
4. As an Ernie user, I want invalid arguments to produce focused usage guidance, so that I can correct mistakes quickly.
5. As an Ernie user, I want the CLI to distinguish usage failures from runtime failures, so that failures are understandable.
6. As an Ernie user, I want the CLI to explain when Ernie is not running, so that local socket details remain hidden.
7. As an Ernie user, I want UI mutations to report the resulting state, so that success has a concrete meaning.
8. As an Ernie user, I want to inspect the current window state, so that I can see whether Ernie is available, visible, focused, or minimized.
9. As an Ernie user, I want to inspect the current theme, so that I can confirm its active appearance.
10. As an Ernie user, I want to inspect sidebar visibility and width, so that I can confirm its current presentation.
11. As an Ernie user, I want focusing Ernie to return verified window state, so that I know the window became usable.
12. As an Ernie user, I want changing the theme to return the applied theme, so that I know the renderer accepted it.
13. As an Ernie user, I want changing sidebar visibility to return the applied visibility, so that I know the renderer accepted it.
14. As an Ernie user, I want changing sidebar width to return the applied width, so that I know validation and persistence succeeded.
15. As an automation author, I want one Capability manifest, so that my automation can discover available controls at runtime.
16. As an automation author, I want each capability to declare its command grammar, so that callers can construct valid invocations.
17. As an automation author, I want each capability to declare input constraints, so that callers can avoid invalid requests.
18. As an automation author, I want each capability to declare its inspectable state, so that callers know what can be observed.
19. As an automation author, I want each capability to declare its result shape, so that callers can consume verified state reliably.
20. As an automation author, I want capability availability to be visible, so that callers can adapt when a UI owner is unavailable.
21. As an RLM, I want small orthogonal UI operations, so that I can compose them through generated code.
22. As an RLM, I want to inspect state before acting, so that I can choose the next operation from current evidence.
23. As an RLM, I want to inspect state after acting, so that I can verify progress and recover from failure.
24. As an RLM, I want stable command identifiers, so that learned decompositions continue to work across compatible releases.
25. As an RLM, I want structured results and errors, so that I can branch without parsing incidental implementation details.
26. As an RLM, I want the CLI to remain stateless between invocations, so that I can control sequencing in my own code.
27. As an RLM, I want failures to include stable codes, so that I can retry only appropriate operations.
28. As a feature developer, I want to register a UI capability once, so that parsing, help, discovery, and validation stay synchronized.
29. As a feature developer, I want capability inputs and results checked at boundaries, so that invalid states do not enter the UI.
30. As a feature developer, I want one authoritative state reader, so that inspection and mutation verification use the same truth.
31. As a feature developer, I want duplicate capability and command identifiers rejected, so that routing remains deterministic.
32. As a feature developer, I want unavailable handlers excluded or marked unavailable, so that discovery never promises unusable controls.
33. As a feature developer, I want renderer-owned capabilities to respond through a fixed bridge, so that new controls do not weaken Electron isolation.
34. As a feature developer, I want main-process capabilities to use the same result contract, so that callers do not care where state lives.
35. As a maintainer, I want one protocol boundary for all UI capabilities, so that socket security and failure handling remain centralized.
36. As a maintainer, I want one command definition to generate both help and discovery data, so that they cannot drift apart.
37. As a maintainer, I want exhaustive built-in dispatch, so that adding a command creates an obvious compile-time obligation.
38. As a maintainer, I want the local socket to remain owner-only, so that another local account cannot control Ernie.
39. As a maintainer, I want malformed and oversized requests rejected before dispatch, so that the UI boundary remains defensive.
40. As a maintainer, I want protocol mismatches reported explicitly, so that mixed application and CLI versions fail clearly.
41. As a maintainer, I want existing public command paths preserved, so that this architecture change remains compatible.
42. As a maintainer, I want capability tests to use public module entry points, so that deep-module boundaries remain enforceable.
43. As a plugin author, I want a future explicit automation contribution, so that a plugin can opt into CLI exposure deliberately.
44. As a plugin author, I want automation contributions to declare schemas and stability, so that public controls are intentional contracts.
45. As an Ernie user, I want ordinary plugin commands hidden from automation by default, so that installing a plugin does not expand control unexpectedly.
46. As an Ernie user, I want UI control to remain local, so that enabling automation does not expose a network service.
47. As an Ernie user, I want Ernie to avoid interpreting natural-language UI requests, so that behavior remains predictable and inspectable.
48. As an Ernie user, I want agents to choose their own workflows, so that Ernie does not impose brittle task-specific scaffolds.

## Implementation Decisions

- Keep `ernie ui` as the public command root. Preserve `focus`, `theme dark`, `theme light`, `sidebar show`, `sidebar hide`, and `sidebar width` with their current valid arguments.
- Keep UI control separate from Agent session control. The harness exposes visible application state and UI actions only.
- Keep the UI-control boundary as one deep module. It owns capability contracts, the Capability manifest, CLI grammar, request and result parsing, client transport, server transport, and stable failure codes.
- Represent every built-in feature as a typed UI capability definition. A definition includes a stable identifier, summary, command paths, argument schema, state schema, result schema, availability contract, and handler contract.
- Use one authoritative definition source to derive CLI parsing, nested help, request validation, and Capability manifest entries. Do not maintain an independent help specification or duplicate manual parser.
- Generate human help locally from built-in definitions, even when Ernie is not running.
- Expose a discovery command under `ernie ui` that returns the Capability manifest. The manifest includes its schema version, capability identifiers, summaries, availability, command paths, input constraints, and result descriptions.
- Expose inspection for all available built-in capabilities and for one selected capability. Inspection returns authoritative state without mutating the UI.
- Treat `window`, `theme`, and `sidebar` as the first built-in capabilities. Their state covers window availability and presentation, active theme, sidebar visibility, and sidebar width.
- Define one stable UI control result envelope. A successful result identifies the protocol version, capability, command, and typed resulting data. A failed result contains a stable error code and safe message.
- Require every successful mutation to return state that proves its postcondition. Dispatch acknowledgement alone is not success.
- Verify window mutations from main-process window state. Verify renderer-owned mutations from the renderer capability that owns and persists that state.
- Replace fire-and-forget renderer mutation events with a fixed request-response bridge for built-in renderer capabilities. Keep Electron channels declared and constrained; do not create arbitrary dynamic preload channels.
- Keep state ownership with the feature that renders and persists it. Do not introduce a global UI state store solely for CLI control.
- Keep the local transport as owner-only newline-delimited JSON over the existing Unix socket. Preserve one request per connection, size limits, timeouts, stale-socket handling, and sanitized failures.
- Version the expanded request, manifest, state, and result contracts. A mixed-version client receives a clear protocol mismatch instead of an invalid-response mystery.
- Preserve the current public command paths and valid ranges. Internal socket compatibility with old binaries is not a permanent contract; the application and bundled CLI advance together.
- Preserve exit code `0` for success, `1` for runtime or application failures, and `2` for invalid command usage.
- Keep current readable success behavior for existing commands. Provide structured discovery, inspection, and result data through one consistent machine-readable rendering supported across commands.
- Keep standard output reserved for successful command data. Send human diagnostics to standard error. Never expose raw socket, IPC, filesystem, or stack errors.
- Retain existing failure codes where their meaning still applies. Add focused codes for unavailable capabilities, protocol mismatch, and failed state verification.
- Reject duplicate capability identifiers, duplicate command paths, invalid schemas, and registration after the built-in registry closes.
- Register built-in capabilities during application startup. Their dispatch remains explicit and exhaustive.
- Do not reuse ordinary renderer plugin commands as UI capabilities. Their current inputless, resultless contract is not sufficient for automation.
- Reserve a separate plugin automation contribution for a later phase. It must require explicit opt-in, schemas, availability, stability metadata, and constrained routing.
- Do not expose arbitrary state paths, generic JSON mutation, code evaluation, or dynamic Electron channels.
- Keep the CLI stateless. The calling person, script, agent, or RLM owns sequencing, loops, retries, and decomposition.
- Document every public capability beside its generated help and manifest contract. Update the UI-control guide with discovery, inspection, result, and failure semantics.

## Testing Decisions

- Use one primary black-box seam: real CLI arguments enter the CLI runner, cross a real temporary owner-only socket, reach a typed capability adapter, and return a verified UI control result.
- Assert external behavior at that seam: accepted commands, rejected arguments, generated help, Capability manifest contents, request validation, dispatch, verified results, structured failures, standard output, standard error, and exit codes.
- Prefer the actual CLI runner over isolated parser tests. Parser helpers may receive focused boundary tests, but they are not the primary proof.
- Use real socket transport in primary tests. Do not mock the client and server away because framing, permissions, timeouts, and protocol parsing are part of the contract.
- Supply a capability adapter with authoritative test state. Mutations update that state, and results must prove the requested postcondition.
- Test that discovery, help, and accepted command paths are derived from the same definitions. Every advertised built-in command must execute, and every accepted command must appear in discovery.
- Test nested help for the command root, each built-in capability, and invalid or incomplete paths.
- Test preservation of every existing valid command and input range.
- Test inspection of all capabilities and one capability without changing state.
- Test focus verification across minimized, hidden, unfocused, available, and unavailable window states.
- Test theme verification for each supported theme and rejection of unsupported values.
- Test sidebar visibility and width verification, including minimum, maximum, fractional, and out-of-range widths.
- Test stable UI control result envelopes for success and every public failure family.
- Test exit code `0` for success, `1` for runtime failure, and `2` for usage failure.
- Test that malformed, trailing, oversized, timed-out, and version-mismatched socket messages never reach capability handlers.
- Preserve tests for owner-only socket permissions, stale socket replacement, and active socket protection.
- Add registry contract tests for duplicate identifiers, duplicate command paths, invalid descriptors, unavailable handlers, and registration after closure.
- Add focused renderer adapter tests for theme and sidebar behavior. These tests prove applied state and persistence through public renderer boundaries, not React implementation details.
- Keep main-process window tests focused on observable window state after focus operations.
- Use existing UI-control package tests as prior art for protocol parsing, real local socket behavior, safe errors, and lifecycle cleanup.
- Use existing component tests as prior art for renderer state changes and persistence.
- Import deep modules only through their root entry points in tests. Run the boundary linter as part of verification.
- Require the complete repository check before completion, including type checks, lint, dependency boundaries, and tests.

## Out of Scope

- Running, orchestrating, or recursively supervising Agent sessions.
- Implementing an RLM, subagent manager, workflow engine, planner, or task decomposition policy.
- Natural-language commands such as an interpreted `ui do` operation.
- Arbitrary UI state-path reads or writes.
- Code evaluation or unrestricted JSON handlers.
- Creating a right sidebar, draft system, or any other example UI feature.
- Exposing repositories, sessions, models, prompts, tasks, or Agent history through UI control.
- Migrating all renderer state into one global store.
- Runtime plugin automation contributions in the first release.
- Automatically exposing existing plugin commands to the CLI.
- Dynamic preload or IPC channel registration.
- Remote control over TCP, HTTP, WebSocket, or a public network interface.
- Starting, restarting, or installing Ernie from the CLI.
- Long-lived compatibility between different internal socket protocol versions.
- Telemetry, remote logging, or recording agent workflows.

## Further Notes

- Herdr provides the architectural inspiration: grouped commands become typed requests, cross one local boundary, and return stable results.
- The Mismanaged Geniuses Hypothesis motivates the product boundary. Ernie defines an expressive, composable UI action language; the model chooses the decomposition and workflow: https://alexzhang13.github.io/blog/2026/mgh/
- The command language should favor small, orthogonal, inspectable operations. Avoid task-specific commands that encode one anticipated workflow.
- A future capability can expose a new UI feature without redesigning the CLI. The feature must still exist and own its state before it can register controls.
- The implementation should begin with the existing window, theme, and sidebar controls. They provide the smallest complete vertical slice for registration, discovery, inspection, mutation, and verification.
