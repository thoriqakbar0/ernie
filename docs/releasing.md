# Develop and release Ernie

Ernie uses one app identity for development and distribution. macOS archives use ad-hoc signing by default, without Developer ID or notarization.

## Commands

| Stage | Command | Result |
| --- | --- | --- |
| Develop | `nub run dev` | Browser renderer and backend with HMR |
| Backend | `nub run dev:server` | Backend for an attached browser |
| Attach browser | `nub run dev:web` | Connect to the development backend |
| Desktop | `nub run dev:desktop` | Electron development app |
| Check development | `nub run dev:check` | Link types and typecheck |
| Prepare version | `nub run release:prepare 0.2.1` | Set version and host compatibility locally |
| Validate | `nub run release:check` | Validate Ernie identity and destination |
| Build | `nub run release:build` | Ad-hoc signed archive without publication |
| Official signing | `nub run release:build:signed` | Build with configured Apple credentials |
| Prerelease | `nub run release:preview` | Publish normal Ernie with GitHub prerelease metadata |
| Production | `nub run release:prod` | Publish normal Ernie as the latest release |
| Initialize source | `nub run release:source:init` | Initialize the release source branch |
| Update source | `nub run release:source:push` | Publish compatible source changes |

## Prepare and verify

Use an isolated worktree. Prepare the version, add `docs/releases/<version>.md`, review changes, and run smoke tests before publication. Publication and officially signed builds require a clean committed candidate. Local ad-hoc builds may include uncommitted fixes; record the base SHA and retain the patch beside the archive. Existing remote tags stop publication.

Both publication commands use the same app name, artwork, bundle ID, and source branch. The preview command only selects GitHub prerelease metadata. The historical v0.2.0 Preview tag remains unchanged.

Ernie uses `dev.zenbu.ernie`, source branch `release`, installed source `~/.zenbu/apps/ernie`, and history `~/.ernie/app-history`. Canonical artwork lives in `assets/brand/production.png`.

The app connects to an existing Prime Agent daemon. It does not launch or stop the daemon. Set `ERNIE_PRIME_AGENT_SOCKET` for a custom socket; otherwise the upstream user socket convention applies. The client SDK remains an application dependency.

## Install a manual local build

Run `nub install`, `nub run release:check`, `nub run brand:check`, `nub run link`, `nub run typecheck`, and `nub run lat:check`. Then run `nub run release:build`. This builds locally without pushing, tagging, or publishing.

Verify `dist/Ernie-<version>-arm64-mac.zip` with `unzip -tq` and verify `dist/mac-arm64/Ernie.app` with `codesign --verify --deep --strict`. Record the archive SHA-256 and source revision before installing.

Quit the installed Ernie app. Keep a recoverable copy of `/Applications/Ernie.app`, `~/.zenbu/apps/ernie`, and `~/.ernie/app-history`. Copy the new app into `/Applications`, then launch that exact path.

The app bundle and editable source are separate. Replacing the bundle does not overwrite an existing editable installation. Use the recovery menu’s official-update review to adopt bundled source. For a manual source replacement, preserve a complete backup first, replace only the source manifest files, and keep `.zenbu`, dependencies, credentials, and sessions intact. Verify the installed source against `Contents/Resources/app/official-source`.

The packaged child uses `NODE_ENV=production`; DialKit, Agentation, and development scenarios do not mount. Recovery remains hidden during normal startup. User history lists explicit saves and registered customization intervals; internal release and startup snapshots stay out of that list.

Verify the workspace, Settings navigation, and the Prime Agent connection. Confirm the process runs from `/Applications/Ernie.app` and that the pre-existing daemon remains alive. Keep the backup until the installed candidate is accepted.

## Publish without Apple credentials

On Apple Silicon, run the publication command after local installation, startup, connection, and shutdown checks pass. The publisher builds, verifies the ad-hoc signature, writes checksums, publishes source, pushes the candidate and tag, and creates the GitHub release.

The archive is not Developer ID signed or notarized. macOS may require approval in System Settings > Privacy & Security after first launch. Do not disable Gatekeeper globally.

Source, tags, and assets are separate operations. If publication fails, inspect what succeeded before retrying. Never overwrite a published tag to repair an archive; prepare a new version.

## Apply an update

Updates are temporarily disabled by default. The service stays disabled, schedules no checks, and hides update controls. Launch with `ERNIE_ENABLE_UPDATES=1` to opt in again; enabled packaged installations check ten seconds after startup and every six hours. Development profiles do not check. The update footer also supports manual checks and retry after failure. State changes arrive through events; reconnect, focus, and online transitions refresh the snapshot without an idle polling timer.

Checks read the advertised release revision first. An unchanged revision needs one metadata request and no source clone. Changed releases clone into a sibling staging directory. Checks reuse that directory while the advertised revision, installed revision, and staged source remain valid. They require an Ernie manifest and compatible host range. They leave running source unchanged. A changed Git revision is available even when its package version is unchanged.

Controls show checking or preparation immediately, even while RPC is pending. Older status responses cannot overwrite newer action feedback.

The Update action installs staged dependencies, rechecks both source trees, and opens native confirmation. Confirmation explains that restart clears unsent drafts and reading positions. Cancelling retains the staged candidate and successful dependency preparation; retry skips installation while its signature and dependency directory remain valid. Failed installation is never cached.

The helper signals readiness before Ernie quits, waits for process exit, and replaces tracked source, Git metadata, and dependencies. Profile directories stay in place, including saved Agents and native session files. After moving dependencies, activation atomically records Zenbu’s dependency signature for the final install path, preventing the launcher from repeating the staged installation. The packaged app permits one instance. A failed activation restores moved files and reopens Ernie with an error notice.

Source integrity is checked again after native confirmation. If shutdown is cancelled, the helper times out without moving source and the running app returns to an error state with the staged candidate retained for retry. Failure to write the result notice does not prevent relaunch. Tracked files can become directories or vice versa; replacements that would consume local files or untracked directories are rejected.

## Recover and verify distribution

Activation retains a sibling `ernie.rollback-<timestamp>` directory containing previous source and dependencies. It does not duplicate profile data. Keep it until the updated app is verified. Remove old staging and rollback directories only after confirming they are no longer needed.

Power loss or a process kill during the file transaction can interrupt rollback. Before manual recovery, close Ernie, preserve the profile, and inspect the backup. The helper does not provide an atomic filesystem transaction or automatic recovery from a failed application boot.

Local checks cover Git HTTP discovery, host rejection, dirty installation rejection, profile retention, obsolete source removal, activation conflicts, and publisher safeguards. The isolated browser scenario exercises availability, explicit application, failed checks, and retry without installing or restarting anything.

Before distribution, verify the ad-hoc signature, clean first installation, dependency downloads, and a real earlier-version update. Official signing additionally requires Developer ID and notarization checks. Test interrupted activation and boot recovery on an isolated packaged profile. No mirror branch, GitHub release, or signed archive was published by this implementation.

## Run the focused checks

Run `nub run test:integration:updates` for the filesystem, Git HTTP, publisher, and helper-process tests. Every fixture uses temporary directories and a local server.

For the isolated browser controls, start `nub exec vite --host 127.0.0.1 --port 4391 --strictPort`. In the `cypress` directory, run `nub exec cypress run --config-file updates.config.ts --browser chrome`. The fixture at `/?browser=1&scenario=updates` uses a synthetic transport and cannot call the updater service.
