<!-- Cached upstream reference; verify against installed APIs. -->

# Advice
Source: https://zenbulabs.mintlify.app/core/advice



Advice lets a plugin wrap or replace a function or React component owned by another plugin, without modifying the original source. This API is inspired by Emacs, where [`defadvice`](https://www.gnu.org/software/emacs/manual/html_node/elisp/Advising-Functions.html) is used to modify existing functions without editing their source.

<Info>
  Advice is a kind of [injection](/core/injections). `this.advise(...)` is sugar over `this.inject(...)` with `meta.kind: "advice"`.
</Info>

## Registering advice

Call `this.advise(...)` from inside a service:

```typescript theme={null}
import { Service } from "@zenbujs/core/runtime"

export class ChromeService extends Service.create({ key: "chrome" }) {
  evaluate() {
    this.setup("wrap-counter", () =>
      this.advise({
        moduleId: "App.tsx",
        name: "Counter",
        type: "around",
        modulePath: "src/content/wrap-counter.tsx",
        exportName: "WrapCounter",
      }),
    )
  }
}
```

| Field           | Meaning                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `moduleId`      | Suffix of the source file that exports the target.                      |
| `name`          | Name of the export to advise.                                           |
| `type`          | One of `"replace"`, `"before"`, `"after"`, `"around"`.                  |
| `modulePath`    | Path to your wrapper module, relative to the plugin root (or absolute). |
| `exportName`    | Named export inside the wrapper module. Defaults to `default`.          |
| `injectionName` | Optional override for the synthetic injection name.                     |

Returns an unregister function. Wrap in `this.setup()` for hot-reload cleanup.

## Around advice

Around-advice receives the next function in the chain (which is the original target, or the next around-advice if several are stacked) as the **first positional argument**. For React components, since React calls components as `Component(props)`, the signature is `(Original, props)`.

```tsx src/content/wrap-counter.tsx theme={null}
import type { ComponentType } from "react"

export function WrapCounter<P>(
  Original: ComponentType<P>,
  props: P,
) {
  return (
    <div className="bordered">
      <Original {...props} />
    </div>
  )
}
```

For a plain function `save({ path }: { path: string })`, around-advice would be:

```typescript theme={null}
export function aroundSave(
  next: (args: { path: string }) => void,
  args: { path: string },
) {
  console.log("before", args.path)
  const result = next(args)
  console.log("after", args.path)
  return result
}
```

Use around-advice when you want to render the original but add structure around it, change its props, or short-circuit it conditionally (skip the `next(...)` call).

## Replace advice

Substitutes the export entirely. The wrapper is used in place of the original.

```tsx theme={null}
export function WrapCounter() {
  return <button>Replaced</button>
}
```

## Before / After

`before` and `after` advice wrap a function without taking over the call.

* `before` runs first with the original args (`...originalArgs`); its return value is ignored.
* `after` runs last with the result followed by the original args (`result, ...originalArgs`). If it returns a value other than `undefined`, that value overrides the result.

```typescript theme={null}
// before: runs first, then the original
export function beforeSave(args: { path: string }) {
  console.log("saving", args.path)
}

// after: runs last; return a value to override the result
export function afterSave(result: void, args: { path: string }) {
  console.log("saved", args.path)
}
```

## Hot reloading

Adding, removing, or editing a `this.advise(...)` call reloads the renderer so the new advice takes effect. Edits inside the advice module itself hot-replace through Vite's normal HMR.


