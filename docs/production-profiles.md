# Run Ernie with separate profiles

Use a named profile to keep a production version’s editable source and history separate from everyday Ernie. This separates application state; it does not sandbox processes running under the same macOS account.

## Launch

The packaged launcher accepts `ERNIE_PROFILE`, using lowercase letters, digits, dots and hyphens (up to 64 characters). Include a version and purpose, such as `production-0.2.1-test`. Reuse that name when restarting the same environment. Use a different name for another version.

```sh
ERNIE_PROFILE=production-0.2.1-test /path/to/profile-enabled/Ernie.app/Contents/MacOS/Ernie
```

The profile-enabled launcher comes from `scripts/history-after-pack.cjs`. Older installed launchers do not support this configuration. Without `ERNIE_PROFILE`, the existing everyday source, history and profile paths are retained; no data is migrated.

The local production copy at `/Users/thor/Applications/Ernie Profiles/Ernie 0.2.1 Test.app` defaults to `production-0.2.1-test`, including when opened from Finder. It uses the installed production bundle’s official source and a locally patched launcher. The everyday `/Applications/Ernie.app` remains unchanged. The copy is ad-hoc signed for local use, not a published release.

## Storage boundaries

All persistent profile state lives under `~/.ernie/profiles/<name>`:

| Location | State |
| --- | --- |
| `source` | Independent official source seed, plugins and installed dependencies |
| `source/.zenbu/db` | Agent roster, selected agent and native conversation roots |
| `source/.zenbu/db/native-roots` | App-created transcripts and child session artifacts |
| `history` | App checkpoints, generations, recovery operations, index and history socket |
| `electron` | Renderer profile, preferences, browser storage and default workspace |
| `electron-recovery` | Recovery host Chromium profile and instance lock |
| `prime` | Prime configuration, authentication, logs, worker descriptors and RLM ledgers |
| `sessions` | Prime-discovered saved sessions and fork/resume destinations |

The Prime socket uses a stable hash of the profile root inside the OS temporary directory to fit macOS socket-path limits. Both parent and child apply the same configuration before startup. Each profile overrides the shared Prime socket and both current and legacy session-directory environment variables. Authentication files are not copied from everyday Prime Agent.

Never copy everyday databases, worker descriptors, ledgers or session files into a new profile: they can contain absolute resume/fork references. Explicitly selecting an external file or folder is still possible. A separate OS account or VM is required to prohibit access to other profiles at the filesystem level.

## Local verification, 2026-09-09

The test copy started with its own Prime Agent 0.9.3 daemon. Its active and saved-session lists were initially empty. A local session fixture named “Profile isolation verification (no model run)” was written through Prime’s session manager; no model request was sent.

Before and after restarting only the test app and daemon:

- The test daemon listed only fixture `01a0846e-2e69-7598-88e6-0effdce3f49c` under the test profile.
- The everyday daemon listed 152 saved sessions, with no test session or test-profile path.
- The test app-history index contained no everyday source or history paths.
- The child process opened Chromium files under the test profile’s `electron` directory.

The fixture remains for inspection. Planner Test and extension-inspector were not stopped, moved or removed. Computer-use observation timed out, so these checks establish process, protocol and storage separation, not visual UI verification or hostile-process isolation.
