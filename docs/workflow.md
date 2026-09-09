# Development workflow

Use browser HMR for UI iteration and keep the current service host alive. [AGENTS.md](../AGENTS.md#ui-iteration) owns test, build, and Electron restart permissions; [README](../README.md#development) owns launch commands.

1. Confirm the checkout, branch, local changes, and running profile.
2. Reproduce the issue at the relevant viewport with known data.
3. Follow `lat search`, `lat section`, and `lat refs` to the owning code.
4. Change that boundary and inspect the affected interaction, including failure and keyboard behavior.
5. Report what changed, what was verified, and remaining limits.

Keep UI decisions in [ui.md](ui.md), ownership in [architecture.md](architecture.md), and protocol invariants in [data-structures.md](data-structures.md). Put transient screenshots, timings, and session identifiers in the task handoff.

## Lint and format changes

Ultracite uses Oxlint's core and React presets, plus `oxlint-plugin-react-doctor`, with Oxfmt for formatting. Install the pinned tools with `nub install`.

| Command                            | Scope                                                 |
| ---------------------------------- | ----------------------------------------------------- |
| `nub run lint:doctor`              | Validate the Ultracite installation and configuration |
| `nub run lint:check`               | Check lint and formatting without changing files      |
| `nub run lint`                     | Run Oxlint alone; accepts paths and `--format json`   |
| `nub run format:check`             | Check formatting alone                                |
| `nub run lint:fix path/to/file.ts` | Apply lint fixes and formatting to selected files     |
| `nub run format path/to/file.ts`   | Format selected files                                 |

Pass explicit paths when fixing files, then review the diff. Without paths, fix commands process the repository. Avoid a repository-wide rewrite during feature work.

Oxfmt preserves semicolon-free source, double quotes, two-space indentation, a 100-column target, and trailing commas. Import sorting stays disabled to preserve side-effect ordering. Package key sorting and Tailwind formatting are disabled. Both tools exclude Zenbu output, build output, dependencies, and vendored repositories.

The presets do not replace Zenbu linking, TypeScript, or Ernie's outline, StyleX, and package-boundary guards. Run `nub run link` before `nub run typecheck` in a fresh checkout. Type-aware Oxlint rules are not enabled. StyleX's `stylex.props` spreads remain supported by the React preset; custom styling checks still enforce Ernie's rules.

`nub run check` includes `lint:check` alongside the existing checks, integrations, and build. The existing pre-commit hook remains unchanged. Follow the repository's opt-in rules before running the full check.

### Compatibility with Ernie

Review fixes against behavior, especially StyleX property ordering, asynchronous loops, callbacks, and hook dependencies. The configuration keeps these exceptions:

- React Compiler lowering diagnostics (`react/todo`) and removal of manual memoization are disabled because this Vite app does not use React Compiler. Memoization still controls reference stability and rendering work.
- The two domain modules using Effect's curried `Schema.TaggedError` factory exclude `unicorn/throw-new-error`; its autofix inserts an invalid constructor call.
- File-mode masks and deterministic avatar hashes retain bitwise operations. Sidebar hashing retains its original UTF-16 code-unit API.
- The session-state provider uses lazy state to retain runtime clients without replacement setters; it excludes the setter-pair naming rule.
- Named Zenbu RPC and lifecycle entry points may omit `this`; they remain instance methods.

Ultracite's doctor validates the tooling setup. Lint, formatting, TypeScript, and Ernie's custom guards each need their own successful check.

## Browser scenarios

Use the existing development server with `?browser=1&scenario=agents` or `?browser=1&scenario=workspaces`. These routes reuse production components with isolated clients. Changing presets resets fixture state; no live commands should be sent.

| Scenario controls | Exercise |
| --- | --- |
| Empty, Populated, Long names, Concurrent activity | Navigation, layout, and state distinctions |
| New Agent, Reject mutations, Slow creation and attachment | Creation rejection, retries, and navigation during admission |
| Reject sends, Slow sends, Long conversation | Draft retention, delayed responses, and reading positions |
| Tool activity, Reconnect, Failed connection | Tool output and unavailable commands |
| Workspace Selection failure, Slow selection, Long paths | Retry, pending selection, and wrapping |
| Four-model catalog | Empty filters and focus recovery |

For send recovery, enable Lose send acknowledgement, send once, disable it, then choose Check send. Expect one message or queued item. Edit the draft before recovery and confirm newer text survives. Disconnect Prime Agent and confirm receipt inspection remains available while new sends are disabled.

Context-provider edits can invalidate consumers during HMR. If a missing-provider error appears, reload that browser tab while keeping the host alive. Report this separately from uninterrupted HMR.

See [verification](verification.md) for integration boundaries and known coverage gaps.

## Capture and control the live UI

Use Codex's @Browser with the URL printed by `nub run dev`. Reuse the same tab for inspection, actions, and screenshots so drafts, open controls, and scroll position remain live. Capture the current viewport without navigating or reloading first.

Read the tab's accessibility state before clicking, filling, or sending keyboard input. Read it again after each action; element references can change. Use a search field or disclosure for a safe interaction check. Sending messages and editing Agents affect real data.

Keep the tab available for the next iteration. This workflow runs through Codex's Browser tool session, not a standalone shell command. The cloud recorder remains available for separate video and trace recordings.

## Interface iteration

For interface requests, treat the rendered page and the user's annotations as the starting evidence.

1. Inspect the running Ernie window or browser page with an available browser/computer tool. Read its current accessibility state and capture the affected viewport. Identify the visible control, state, and desired result before locating its source.
2. Use Agentation to select elements and write visual feedback. In development, Send to Agent stages feedback in the selected parent chat's composer; review and send it there. Without a selected parent chat, copy the feedback into a new message. Annotations identify the target and requested change; source snippets only help locate its implementation.
3. Reproduce the interaction and record the viewport, open panels, and state needed to see the problem. Use the existing HMR runtime. Keep user drafts and the current conversation intact.
4. Follow the observed element to its source and make the smallest complete change. Reinspect the same UI state after HMR; exercise the affected action and its keyboard path. Iterate on visible problems before declaring completion.
5. Report the visible before/after result and what you observed. Distinguish source checks from live verification. If the current agent lacks browser/computer tools, say which access is missing and request it; source inspection alone cannot verify interface behavior.

The development Agentation toolbar stores annotations locally. Its Send to Agent action prepares a draft; it does not submit a prompt or require an MCP service. For existing conversations, staged feedback explicitly points to this workflow.
