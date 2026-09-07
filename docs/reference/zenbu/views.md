<!-- Cached upstream reference; verify against installed APIs. -->

# Views
Source: https://zenbulabs.mintlify.app/core/views



`<View>` renders an [injection](/core/injections) as React. The injection registry is the source of truth. `<View name="...">` looks up the component registered under `name` (by a service's `this.inject(...)` or by `useRegisterInjection(...)`) and mounts it inside the host tree.

There's no separate "view registry", no iframes, no per-view Vite server. Everything is one React tree under `<ZenbuProvider>`, sharing the host's RPC, events, DB, theme, and CSS.

## Embedding a view

```tsx theme={null}
import { View } from "@zenbujs/core/react"

<View
  name="terminal"
  args={{ tabId }}
  fallback={<Spinner />}
/>
```

| Prop                 | Meaning                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `name`               | Injection name to render. Required.                                                                                                      |
| `args`               | Object forwarded as the `args` prop and on `useViewArgs()`.                                                                              |
| `visible`            | When `false`, hides the wrapper via `display: none` without unmounting. Use it to preserve in-component state across visibility toggles. |
| `fallback`           | Rendered while no injection has registered under `name`.                                                                                 |
| `className`, `style` | Forwarded to the wrapper.                                                                                                                |

If no injection has registered yet, `<View>` renders the `fallback`
(an empty `<span data-zenbu-view-pending={name}>` if you don't pass
one). Once a registration lands, it swaps in automatically.

## Reading view args

Inside the rendered component, both the `args` prop and the
`useViewArgs()` hook are populated with the same object:

```tsx theme={null}
import { useViewArgs, type ViewComponentProps } from "@zenbujs/core/react"

export default function TerminalApp({ args }: ViewComponentProps<{ tabId: string }>) {
  // Either of these works:
  const fromProps = args.tabId
  const fromHook = useViewArgs<{ tabId: string }>().tabId
  // …
}
```

`useViewArgs` is the convenient escape hatch for deeply nested children that don't want to thread `args` down manually. The hook re-renders when the parent `<View>` passes a new `args` object.

## Registering the component a view renders

A view is just an injection. Use the API that fits your situation:

* **Inside a service** (most plugins): `this.inject({ name, modulePath, meta })` from [Injections](/core/injections).
* **From the React tree**: `useRegisterInjection(name, Component, meta)`.

```typescript theme={null}
// From a service.
this.setup("inject", () =>
  this.inject({
    name: "terminal",
    modulePath: "./src/views/terminal-view.tsx",
    meta: { kind: "bottom-panel", label: "Terminal" },
  }),
)
```

```tsx theme={null}
// From React.
useRegisterInjection("terminal", TerminalView, {
  kind: "bottom-panel",
  label: "Terminal",
})
```

## See also

* [Injections](/core/injections) for the full registration surface and `meta` conventions.
* [Advice](/core/advice) for wrapping or replacing another plugin's view.
