Packages are deep modules — see [src/packages/README.md](./src/packages/README.md) before adding or importing one.

Follow [STYLE.md](./STYLE.md) for source file names and code style.

Use Nub for dependency installation, TypeScript execution, and package scripts. Use Nub's `--node` mode when starting Electron.

Restart only Ernie's development process when rerunning Ernie.

Never send synthetic keyboard shortcuts or activate ChatGPT during a rerun.

Handle macOS Desktop placement separately, using only a verified window-management method.

After each requested repository change, run the required local checks, commit only its scoped files, and push directly to `main`. Then run `gh signoff --commit HEAD` and verify with `gh signoff status --commit HEAD`. Do not wait for a separate push request. Never sign off a commit whose checks failed.
