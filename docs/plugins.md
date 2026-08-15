# Ernie plugins

Ernie has a versioned plugin host with Browser, React Grab, and Agentation built
in.

Plugin API version 3 combines activation events with two lifecycle dimensions:

- view plugins activate lazily when their workbench UI is requested;
- application-wide tools activate at startup;
- effect-local lifecycle owns resources acquired during one activation;
- spatial composition orders providers and consumers around required services.

The host validates immutable manifests before use. It rejects duplicate plugins,
contributions, and service providers. It also rejects missing providers and
required-service cycles.

Activation stays transactional. The host activates every required provider
before its consumer. It publishes services, commands, and views only after the
complete activation validates.

Disable follows reverse dependency order. Active consumers clean up before
their providers, so required services remain readable during consumer cleanup.
Re-enabling a provider restores previously demanded consumers after every
required provider becomes available. Never-demanded consumers remain inactive.

These rules translate Cordis's provider-consumer idea into Ernie's vocabulary.
Ernie does not depend on Cordis or implement its broader context framework.

## Package boundaries

`src/packages/plugin-host/` owns the platform contract, service graph, and
runtime reconciler. Its generic view value keeps the host independent from
React and Electron.

`src/packages/browser-plugin/` owns Browser metadata, address parsing, preload
capabilities, native Electron lifecycle, and its workbench view.

`src/packages/react-grab-plugin/` lazily loads React Grab and owns its startup
lifecycle.

`src/packages/agentation-plugin/` owns Agentation mounting, safe placement,
sync configuration, and cleanup.

`src/components/plugin-activity-bar.tsx` renders host-owned navigation for
available primary views. A consumer view disappears while a required provider
is unavailable.

`src/components/plugin-manager-dialog.tsx` renders the validated installed
plugin catalog. Disabling a provider removes dependent behavior without
changing unrelated plugins. Enabling a startup plugin restores it immediately.

`src/components/plugin-view-boundary.tsx` contains plugin render defects so
host navigation and recovery controls remain available.

## Declaring services

Manifests keep serializable service identifiers separate from runtime values.
Every provided service uses a globally unique dotted identifier inside its
provider's plugin namespace.

```ts
export const documentStoreKey = createPluginServiceKey<DocumentStore>(
  'acme.documents.store',
);

const providerManifest: PluginManifest = {
  apiVersion: currentPluginApiVersion,
  id: 'acme.documents',
  name: 'Documents',
  version: '1.0.0',
  description: 'Provides document access.',
  activationEvents: [],
  provides: [documentStoreKey.id],
  requires: [],
  contributes: { commands: [], views: [] },
};
```

Consumers import the same opaque service key and declare its identifier.
Sharing the key preserves the value type and lets the host reject mismatched
runtime tokens.

```ts
const consumerManifest: PluginManifest = {
  apiVersion: currentPluginApiVersion,
  id: 'acme.search',
  name: 'Search',
  version: '1.0.0',
  description: 'Searches documents.',
  activationEvents: [{ event: 'startup' }],
  provides: [],
  requires: [documentStoreKey.id],
  contributes: { commands: [], views: [] },
};
```

## Activation and cleanup

Providers publish declared services during activation. Consumers read only
declared required services.

```ts
const provider: PluginModule<RenderedView> = {
  manifest: providerManifest,
  activate(context) {
    context.provideService(documentStoreKey, documentStore);
  },
};

const consumer: PluginModule<RenderedView> = {
  manifest: consumerManifest,
  async activate(context) {
    const documents = context.getService(documentStoreKey);
    await context.acquire(() => ({
      value: documents.subscribe(),
      cleanup: () => documents.unsubscribe(),
    }));
  },
};
```

`activateStartupPlugins()` marks startup plugins as demanded and activates their
complete provider chains. Repeated startup requests share active instances.

An activation must publish every declared service and register every declared
command and view. Undeclared publication or consumption fails the activation.
The host rolls back every staged service, contribution, and acquired effect.

Cleanup runs once in reverse effect-acquisition order. A cleanup failure does
not prevent older effects, other consumers, or providers from draining. Host
results expose stable plugin identifiers and safe error tags.

## Adding a built-in plugin

1. Add one deep module under `src/packages/`.
2. Declare a manifest for the current API version.
3. Choose startup activation or view activation.
4. Prefix every provided service, view, and command with the plugin identifier.
5. Declare every required service by its shared key identifier.
6. Publish every declared service during activation.
7. Register every declared command and view during activation.
8. Acquire every resource with its cleanup during activation.
9. Add the module at Ernie's renderer composition root.
10. Test graph validation, activation, rollback, disable, recovery, and cleanup.
11. Test the plugin's visible behavior through the public host seam.

## Security boundary

The Browser plugin uses Electron `WebContentsView`, not an embedded webview
tag. Its page has context isolation, sandboxing, no Node.js integration, and a
dedicated persistent session.

It accepts only HTTP and HTTPS navigation. It denies page permission requests
by default.

Current renderer plugins are trusted built-in code. Spatial composition controls
lifecycle order and service visibility. It does not sandbox JavaScript, prevent
direct DOM access, or make hostile plugins safe.

External plugin download and untrusted code execution remain out of scope.
Those capabilities need signing, isolation, permissions, updates, and removal
before Ernie can expose an install button safely.
