# Release and update Ernie

Ernie uses Zenbu source updates. The signed Electron package installs source from the dedicated `release` branch. Installed apps check that branch automatically and offer an explicit update-and-restart action.

## Publish compatible source

`release.json` owns the destination: `thoriqakbar0/ernie#release`. Both packaging and the publisher read it. Configuration and publisher checks reject `main` and `master`.

Run `nub run release:check` to validate the destination and host compatibility without network access or publication. Publication requires a clean committed checkout and explicit authorization:

1. Run `nub run publish:source init` once to initialize the dedicated mirror branch.
2. Run `nub run publish:source push` for later source releases.

Each publication stages source first. The wrapper rejects extra flags, preventing destination overrides and forced publication. Git’s configured credential helper supplies publisher authentication; the wrapper removes token environment variables before invoking Zenbu, whose success output can otherwise include a credential-bearing URL.

Do not invoke `zen publish:source` directly against the development branch: it replaces the target’s tracked tree with staged source. Installed apps require credential-free read access to the mirror and dependency assets. Protect the release branch so only reviewed source can reach installed apps.

## Package the Electron host

`package.json#version` becomes the packaged host version. `package.json#zenbu.host` declares compatible hosts; `0.1.0` satisfies the current `>=0.1.0 <0.2.0` range.

Run `nub run release:build` from a clean committed checkout after initializing the mirror. It stages source and invokes the existing macOS ZIP packaging with signing required, hardened runtime enabled, notarization enabled, and publishing disabled. Apple signing and notarization credentials must be available to electron-builder. Keep their values outside source control and logs.

Bump the version for each Electron package. Change the compatibility range when source requires another embedded runtime or toolchain. Source updates cannot replace Electron or the launcher: incompatible releases display a message requiring a newer Electron package.

Local development uses Nub. Installed apps retain Zenbu’s embedded pnpm 10.33.0 toolchain.

## Apply an update

Packaged Ernie checks ten seconds after startup and every six hours. Development profiles do not check. The update footer also supports manual checks and retry after failure. State changes arrive through events; reconnect, focus, and online transitions refresh the snapshot without an idle polling timer.

Checks read the advertised release revision first. An unchanged revision needs one metadata request and no source clone. Changed releases clone into a sibling staging directory. Checks reuse that directory while the advertised revision, installed revision, and staged source remain valid. They require an Ernie manifest and compatible host range. They leave running source unchanged. A changed Git revision is available even when its package version is unchanged.

Controls show checking or preparation immediately, even while RPC is pending. Older status responses cannot overwrite newer action feedback.

The Update action installs staged dependencies, rechecks both source trees, and opens native confirmation. Confirmation explains that restart clears unsent drafts and reading positions. Cancelling retains the staged candidate and successful dependency preparation; retry skips installation while its signature and dependency directory remain valid. Failed installation is never cached.

The helper signals readiness before Ernie quits, waits for process exit, and replaces tracked source, Git metadata, and dependencies. Profile directories stay in place, including saved Agents and native session files. After moving dependencies, activation atomically records Zenbu’s dependency signature for the final install path, preventing the launcher from repeating the staged installation. The packaged app permits one instance. A failed activation restores moved files and reopens Ernie with an error notice.

Source integrity is checked again after native confirmation. If shutdown is cancelled, the helper times out without moving source and the running app returns to an error state with the staged candidate retained for retry. Failure to write the result notice does not prevent relaunch. Tracked files can become directories or vice versa; replacements that would consume local files or untracked directories are rejected.

## Recover and verify distribution

Activation retains a sibling `ernie.rollback-<timestamp>` directory containing previous source and dependencies. It does not duplicate profile data. Keep it until the updated app is verified. Remove old staging and rollback directories only after confirming they are no longer needed.

Power loss or a process kill during the file transaction can interrupt rollback. Before manual recovery, close Ernie, preserve the profile, and inspect the backup. The helper does not provide an atomic filesystem transaction or automatic recovery from a failed application boot.

Local checks cover Git HTTP discovery, host rejection, dirty installation rejection, profile retention, obsolete source removal, activation conflicts, and publisher safeguards. The isolated browser scenario exercises availability, explicit application, failed checks, and retry without installing or restarting anything.

Before distribution, verify a signed and notarized archive, clean first installation, dependency downloads, and a real earlier-version update. Test interrupted activation and boot recovery on an isolated packaged profile. No mirror branch, GitHub release, or signed archive was published by this implementation.

## Run the focused checks

Run `nub run test:integration:updates` for the filesystem, Git HTTP, publisher, and helper-process tests. Every fixture uses temporary directories and a local server.

For the isolated browser controls, start `nub exec vite --host 127.0.0.1 --port 4391 --strictPort`. In the `cypress` directory, run `nub exec cypress run --config-file updates.config.ts --browser chrome`. The fixture at `/?browser=1&scenario=updates` uses a synthetic transport and cannot call the updater service.

## Unsigned 0.2.0 preview

This preview uses Ernie Preview, dev.zenbu.ernie.preview, and the release-preview mirror. Its source lives under ~/.zenbu/apps/ernie-preview and history under ~/.ernie-preview/app-history. The shared Prime Agent daemon remains shared.

Run `nub run release:build:unsigned` from a clean committed preview checkout. This explicit macOS-only command disables notarization and certificate discovery and requests ad-hoc signing for Apple Silicon execution. It has no Developer ID signature and no Apple notarization. The standard signed build command is unchanged.

After verification, publish tag v0.2.0 as a GitHub prerelease with --latest=false, attach the macOS archive and SHA256SUMS, and describe the unsigned status. macOS may block first launch; users must explicitly approve this trusted download in System Settings > Privacy & Security. Do not disable Gatekeeper globally.

### Repeat the unsigned preview flow

Commit a versioned candidate and its docs/releases/<version>.md notes, then run `nub run release:preview` on an Apple Silicon Mac. The script validates the candidate, builds locally without Developer ID or notarization, verifies the ad-hoc signature, writes SHA256SUMS, publishes the dedicated source mirror, pushes the candidate branch and version tag, and creates a GitHub prerelease. Existing remote tags stop the flow before building; inspect partial publication before retrying.

Run integration checks before committing. The script intentionally leaves the stable source channel unchanged. It requires Nub, ImageMagick 7, GitHub CLI authentication, and network access. Signing credentials are unnecessary.
