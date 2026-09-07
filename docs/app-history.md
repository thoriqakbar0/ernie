# App history

Ernie’s installed desktop host owns application-source history. App history is a tab within Settings. The recovery window runs outside editable app source and remains usable when the application cannot start.

## Protected boundary

The immutable `sourceManifest` in `src/host/history/source-store.ts` defines captured application files. Capture rejects symbolic links and missing required inputs. Databases, sessions, environment files, credentials, dependencies, generated builds, and Git metadata are excluded. Development repositories cannot enable restoration through RPC.

The controller saves two matching reads before publishing a checkpoint. Content-addressed objects and atomic metadata replacements live in `~/.ernie/app-history`, outside the managed application. Automatic capture runs after three quiet seconds and periodically during continued edits. Identical compatible source trees reuse their checkpoint identity.

Checkpoint titles supplied by editing clients are suggestions. Changed-file inventories come from content comparisons. A registered editing interval does not prove exclusive authorship; overlapping registrations are disclosed. Source and diff text remain quoted data in both interfaces.

## Recovery and updates

A restore proposal binds a target checkpoint to the current content identity. Only the bundled host can execute approval. It revalidates source identity, compatibility, integrity, active customization, and disk space; captures the current state; prepares a new generation and locked dependencies; persists its pointer; and waits for startup readiness.

An interrupted opening returns to the journal’s previous generation. A failed opening retains recovery and attempts the previous generation. Old generation directories remain available; the controller reports edits observed there without merging them into the selected app. The selected generation survives restart.

A startup-checked checkpoint means the editable app reached its readiness marker. It does not establish feature correctness. The host keeps the original database path when opening later source generations.

New desktop builds bundle official source. First installation copies that source into the managed app directory. Existing customized source stays selected. **Review official update…** prepares a checkpoint and a restore proposal for the bundled official source; replacement still requires host approval. This implementation does not fetch or silently install remote official updates.

## People and agents

**Settings → App history** lists checkpoints and opens their details. Restore requests open the independent recovery window for final approval. **Customize Ernie** opens a dedicated Agent in the managed source directory. Its dispatch boundary captures and registers an operation before sending. Capture failure retains the draft. Completion capture follows the native idle signal.

The local socket accepts protocol 1 requests authenticated with a private endpoint token. It never binds TCP. CLI, stdio MCP, and the editable UI use this controller. The agent interface has no activation operation.

The bundled `ernie-history` executable accepts a method and JSON arguments, or `--mcp`. `--help` and the MCP `ernie://editing-guide` resource expose the versioned guide. Connection credentials are discovered locally and stay out of prompts. Large file lists use cursors; text content pages expose `nextOffset`. Binary content exposes metadata.

## Retention

Automatic retention keeps the latest 100 unkept checkpoints within a 1 GB object budget. Baseline, current, latest startup-checked, latest pre-restore, active-operation baselines, pending proposals, and kept checkpoints are protected. A protected set above budget produces a storage warning. Old generation directories and installed dependencies are currently retained separately from the object budget.

## Validation and packaging

Controller integration tests use disposable roots and cover replacement, return, restart, stale proposals, corruption, compatibility, external capture, overlap disclosure, dependency failure, retention, and journal recovery. `scripts/history-agent-smoke.mjs` exercises the real CLI and stdio MCP against a disposable controller. `scripts/history-desktop-fixture.mjs` opens a disposable Electron application and independent recovery host for interactive failure testing.

The browser Settings history tab renders the production history component with an isolated example client. Legacy `scenario=history` links open this tab. It cannot restore application files. The normal development route presents the installed-app availability boundary.

`electron-builder.json` runs `scripts/history-after-pack.cjs` before signing. The hook checks the installed Zenbu launcher shape, stages the allowed source, bundles the controller and adapters, and replaces only the staged launcher. A Zenbu launcher change fails packaging instead of silently dropping recovery. Building an unsigned local application is separate from publishing or releasing it.
