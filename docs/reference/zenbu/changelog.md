<!-- Cached upstream reference; verify against installed APIs. -->

# Changelog
Source: https://zenbulabs.mintlify.app/changelog/overview

New features, updates, and fixes for Zenbu.js.

<Update label="June 5, 2026">
  ## Week of June 2 — desktop app v0.0.10 and `@zenbujs/core` 0.4.3

  The Zenbu desktop app shipped five releases this week (v0.0.6 → v0.0.10, signed and notarized for macOS), along with `@zenbujs/core` 0.3.0 → 0.4.3, `create-zenbu-app` 0.0.36, and `create-desktop-app` 0.1.4.

  ### New

  * **Enable and disable plugins at runtime.** You can now turn plugins on and off without restarting the app. Injections hot-reload when a plugin's state changes, so views and patched behavior update in place. See [Plugins](/core/plugins) and [Injections](/core/injections).
  * **`relaunch()` bridge on the installing screen.** Plugin installation can trigger a clean app relaunch from the install flow, so first-run setup completes without a manual restart.
  * **`makeCollection` is now exported.** The collection helper is part of the public API surface for building typed groups of records on top of [state](/core/state).

  ### Updates

  * **Self-healing plugin clones.** If a plugin install is interrupted (network drop, force-quit, partial download), the next launch detects the broken state and finishes or re-clones the plugin automatically — no more stuck "installing" screens.
  * **Plugin service internals reworked.** The data structure backing [services](/core/services) was simplified, paving the way for the enable/disable feature and reducing the work done on plugin load.

  ### Fixes

  * **Proxy memory leak resolved.** Long-running sessions no longer accumulate memory through the RPC proxy layer used by [RPC](/core/rpc) and [advice](/core/advice).
  * **Garbage collection issues fixed.** Several plugin lifecycle objects were being retained after teardown; they are now released correctly, lowering steady-state memory use.
</Update>


