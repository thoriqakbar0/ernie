# Resource-safe development

- Keep exactly one long-running `pnpm dev` process. Reuse it for UI work and stop it before starting another; the fixed strict Vite port intentionally rejects duplicates.
- Build one tight feedback loop: run the smallest relevant test file while iterating, then run `pnpm test` once before finishing. Do not run build, typecheck, and test commands concurrently.
- Treat `pnpm check` and `pnpm package:mac` as expensive final verification. Run them only when the task needs smoke/package validation, never as an iteration loop.
- Delegate only genuinely independent, context-heavy work. Keep at most two subagents alive at once and delete each one when its result is integrated.
- Any spawned process must have explicit ownership, a bounded wait, and whole-process-tree cleanup on success, failure, cancellation, and shutdown.
