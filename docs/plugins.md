# Ernie plugins

Ernie has a versioned plugin host with Browser, React Grab, and Agentation built in.

API version 3 supports these editor-style foundations:

- manifests declare identity, API compatibility, activation events, commands, and primary views;
- the host validates ownership and rejects duplicate plugin, view, or command identifiers;
- view plugins activate lazily, while application-wide tools activate at startup;
- activation is transactional, so a failed plugin cannot leave partial resources behind;
- plugins register their own view renderer instead of adding plugin-specific branches to Ernie's shell;
- Ernie contains view render failures and keeps retry and disable controls outside plugin ownership;
- every activated plugin owns cleanup through an effect-scoped lifecycle.

## Package boundaries

`src/packages/plugin-host/` owns the platform contract and runtime. Its generic view value keeps the host independent from React and Electron.

`src/packages/browser-plugin/` owns Browser metadata, address parsing, preload capabilities, native Electron lifecycle, and its workbench view.

`src/packages/react-grab-plugin/` lazily loads React Grab and owns its startup lifecycle.

`src/packages/agentation-plugin/` owns Agentation mounting, safe placement, sync configuration, and cleanup.

`src/components/plugin-activity-bar.tsx` renders host-owned navigation for contributed primary views.

`src/components/plugin-manager-dialog.tsx` renders the validated installed-plugin catalog. Disabling a plugin removes its contributions, runs its cleanup, and persists the choice. Enabling a startup plugin restores it immediately; selecting a view restores its plugin lazily.

`src/components/plugin-view-boundary.tsx` contains plugin render defects so host navigation and recovery controls remain available.

## Adding a built-in plugin

1. Add one deep module under `src/packages/`.
2. Declare a manifest for the current API version.
3. Choose startup activation for application-wide tools or view activation for workbench UI.
4. Prefix every view and command identifier with the plugin identifier.
5. Register every declared command and view during activation.
6. Render workbench UI only inside the view slot supplied by Ernie.
7. Acquire every resource with its cleanup during activation.
8. Add the module at Ernie's renderer composition root.
9. Test manifest validation, activation, UI, disable, restore, cleanup, and visible behavior.

Activation is transactional. Ernie publishes no command or view renderer until the plugin registers every declared contribution successfully.

Disable is the rollback boundary. Ernie returns to its Agents view, removes the plugin's UI and commands, and releases its activation resources. Restore permits a fresh lazy activation.

## Security boundary

The Browser plugin uses Electron `WebContentsView`, not an embedded webview tag.

Its page has context isolation, sandboxing, no Node.js integration, and a dedicated persistent session.

It accepts only HTTP and HTTPS navigation. It denies page permission requests by default.

External plugin download and untrusted code execution are not part of API version 3. Those need signing, isolation, permissions, updates, and removal before Ernie can expose an install button safely.

Current renderer plugins are trusted built-in code. The host controls their workbench slot and contains React render failures, but it does not sandbox their JavaScript or prevent direct DOM access. Do not load third-party bundles into this contract.
