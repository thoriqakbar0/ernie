<!-- Cached upstream reference; verify against installed APIs. -->

# Injections

Source: https://zenbulabs.mintlify.app/core/injections

An injection is a named value a plugin registers for other code to find. The value can be a React component or a function. Other code looks up injections by name, or filters them by optional metadata.

## Registering an injection

From a service, call `this.inject(...)`:

```typescript src/main/services/my-plugin.ts theme={null}
import { Service } from "@zenbujs/core/runtime"

export class MyPluginService extends Service.create({ key: "myPlugin" }) {
  evaluate() {
    this.setup("inject", () =>
      this.inject({
        name: "my-plugin",
        modulePath: "./src/views/my-view.tsx",
        meta: { kind: "left-sidebar", label: "My plugin" },
      }),
    )
  }
}
```

| Field | Required | Description |
| --- | --- | --- |
| `name` | yes | Unique key in the registry. Last writer wins. |
| `modulePath` | yes | Path to the module. Relative paths resolve against the plugin directory. |
| `exportName` | no | Named export. Defaults to `default`. |
| `meta` | no | JSON-serializable object. Consumers filter on it. |

The call returns an unregister function. Wrap it in `this.setup(...)` so it cleans up on hot reload.

## Reading injections

`useInjections({ kind })` returns the live list of injections whose `meta.kind` matches.

```tsx theme={null}
import { useInjections } from "@zenbujs/core/react"

function LeftSidebar() {
  const tabs = useInjections({ kind: "left-sidebar" })
  return tabs.map((tab) => <Tab key={tab.name} label={tab.meta?.label} />)
}
```

## Rendering an injection

`<View name="...">` looks up the injection and renders its value as a React component. `args` is passed to the component as a prop and is also available via `useViewArgs()` in any child.

```tsx theme={null}
import { View } from "@zenbujs/core/react"

;<View name="my-plugin" args={{ workspaceId }} fallback={<Loading />} />
```

| Prop       | Description                                                             |
| ---------- | ----------------------------------------------------------------------- |
| `name`     | Injection name. Required.                                               |
| `args`     | Object passed to the component as `args`.                               |
| `visible`  | When `false`, hides the wrapper via `display: none` without unmounting. |
| `fallback` | Rendered when nothing is registered under `name` yet.                   |

## Meta conventions

The framework does not read `meta`. Consumers do. The conventional keys are:

| Key | Used for |
| --- | --- |
| `kind` | Slot discriminator. |
| `label` | Display text on tabs, palette entries, buttons. |
| `icon` | Inline SVG. Auto-filled from the plugin's `icons:` map when the key matches the injection `name`. |
| `order` | Sort hint within a slot. Lower comes first. |

## Registering from React

`useRegisterInjection` registers an injection while the calling component is mounted, and unregisters on unmount. Use it when the value can only be constructed inside React, for example a CodeMirror extension built from a hook's state.

```tsx theme={null}
import { useRegisterInjection } from "@zenbujs/core/react"

function VimSentinel() {
  useRegisterInjection("cm-vim", vim(), {
    kind: "cm.composer-extension-editable",
  })
  return null
}
```

## Injecting without a value

With no `meta`, the framework just imports the module. The module's top-level code runs, but nothing is added to the registry.

```typescript theme={null}
this.inject({
  name: "my-plugin/devtools",
  modulePath: "./src/content/devtools.tsx",
})
```

## Advice

Advice is a kind of injection that replaces or wraps a specific exported function or component anywhere in the app. It is registered with `this.advise(...)`, which targets the export by its source file and export name.

```typescript theme={null}
this.setup("wrap-counter", () =>
  this.advise({
    moduleId: "Counter.tsx",
    name: "Counter",
    type: "around",
    modulePath: "./src/wrap-counter.tsx",
  }),
)
```

The `type` field controls how the wrapper relates to the original:

- `replace` substitutes the original entirely.
- `around` runs in place of the original. It receives the next function in the chain as its first argument; call it (or don't) to decide whether the original runs.
- `before` runs first with the original arguments.
- `after` runs last and receives the result followed by the original arguments. Returning a value other than `undefined` overrides the result.

`this.advise(...)` is sugar over `this.inject(...)` with `meta.kind: "advice"`. For the full reference, including how the wrapper module should be written for each `type`, see [Advice](/core/advice).

## Hot reloading

Adding, removing, or editing a `this.inject(...)` call invalidates the renderer prelude and reloads the window. Edits inside the injection module itself hot-replace through Vite.
