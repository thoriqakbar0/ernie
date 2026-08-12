# Ernie plugins

Ernie has a versioned plugin host and three built-in plugins: AI Chat, Subagents, and Browser.

The first API version supports six editor-style foundations:

- manifests declare identity, API compatibility, activation events, commands, and views;
- the host validates ownership and rejects duplicate plugin, view, or command identifiers;
- activation is lazy and transactional, so a failed plugin cannot leave partial commands behind;
- plugins register their own view renderer instead of adding plugin-specific branches to Ernie's shell;
- Ernie contains view render failures and keeps retry and disable controls outside plugin ownership;
- every activated plugin owns cleanup through one disposable lifecycle.

## Package boundaries

`src/packages/plugin-host/` owns the platform contract and runtime. Its generic view value keeps the host independent from React and Electron.

`src/packages/browser-plugin/` owns Browser metadata, address parsing, preload capabilities, native Electron lifecycle, and its workbench view.

`src/packages/ai-chat-plugin/` owns the focused Agent transcript and execution work.

`src/packages/subagents-plugin/` owns the focused Agent's recursive delegated-work tree.

`src/packages/agent-plugin-context/` defines the current Agent state supplied by Ernie to Agent views.

`src/components/plugin-activity-bar.tsx` renders host-owned navigation for contributed primary views.

`src/components/agent-plugin-views.tsx` renders ordered Agent views inside the selected Agent.

`src/components/plugin-manager-dialog.tsx` renders the validated installed-plugin catalog. Disabling a plugin removes its views and commands, runs its cleanup, and persists the choice. Enabling it restores its contributions lazily.

`src/components/plugin-view-boundary.tsx` contains plugin render defects so host navigation and recovery controls remain available.

## Adding a built-in plugin

1. Add one deep module under `src/packages/`.
2. Declare a manifest for the current API version.
3. Prefix every view and command identifier with the plugin identifier.
4. Register every declared command and view during activation.
5. Choose `primary` navigation or the selected `agent` surface for each view.
6. Render only inside the view slot supplied by Ernie.
7. Return a disposable when activation acquires a resource.
8. Add the module at Ernie's renderer composition root.
9. Test manifest validation, activation, UI, disable, restore, cleanup, and visible behavior.

Activation is transactional. Ernie publishes no command or view renderer until the plugin registers every declared contribution successfully.

Disable is the rollback boundary. Ernie removes the plugin's UI and commands, then releases its resources. Restore permits fresh lazy activation.

## Security boundary

The Browser plugin uses Electron `WebContentsView`, not an embedded webview tag.

Its page has context isolation, sandboxing, no Node.js integration, and a dedicated persistent session.

It accepts only HTTP and HTTPS navigation. It denies page permission requests by default.

External plugin download and untrusted code execution are not part of API version 1. Those need signing, isolation, permissions, updates, and removal before Ernie can expose an install button safely.

Current renderer plugins are trusted built-in code. The host controls their workbench slot and contains React render failures, but it does not sandbox their JavaScript or prevent direct DOM access. Do not load third-party bundles into this contract.
