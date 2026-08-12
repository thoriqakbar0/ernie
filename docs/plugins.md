# Ernie plugins

Ernie now has a versioned plugin host and one built-in Browser plugin.

The first API version supports four editor-style foundations:

- manifests declare identity, API compatibility, activation events, commands, and primary views;
- the host validates ownership and rejects duplicate plugin, view, or command identifiers;
- activation is lazy and transactional, so a failed plugin cannot leave partial commands behind;
- every activated plugin owns cleanup through one disposable lifecycle.

## Package boundaries

`src/packages/plugin-host/` owns the platform contract and runtime. It has no React or Electron dependency.

`src/packages/browser-plugin/` owns Browser metadata, address parsing, preload capabilities, native Electron lifecycle, and its workbench view.

`src/components/plugin-activity-bar.tsx` renders host-owned navigation for contributed primary views.

`src/components/plugin-manager-dialog.tsx` renders the validated installed-plugin catalog.

## Adding a built-in plugin

1. Add one deep module under `src/packages/`.
2. Declare a manifest for the current API version.
3. Prefix every view and command identifier with the plugin identifier.
4. Register every declared command during activation.
5. Return a disposable when activation acquires a resource.
6. Add the module at Ernie's renderer composition root.
7. Render its declared view through a package root entry point.
8. Test manifest validation, activation, commands, cleanup, and visible behavior.

## Security boundary

The Browser plugin uses Electron `WebContentsView`, not an embedded webview tag.

Its page has context isolation, sandboxing, no Node.js integration, and a dedicated persistent session.

It accepts only HTTP and HTTPS navigation. It denies page permission requests by default.

External plugin download and untrusted code execution are not part of API version 1. Those need signing, isolation, permissions, updates, and removal before Ernie can expose an install button safely.
