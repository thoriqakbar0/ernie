Packages are deep modules — see [src/packages/README.md](./src/packages/README.md) before adding or importing one.

Follow [STYLE.md](./STYLE.md) for source file names and code style.

Use Nub for dependency installation, TypeScript execution, and package scripts. Use Nub's `--node` mode when starting Electron.

When pushing to `main`, run the required local checks first. Push the verified commit, then run `gh signoff`. Never sign off a commit whose checks failed.
