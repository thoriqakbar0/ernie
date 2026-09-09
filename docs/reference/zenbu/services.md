<!-- Cached upstream reference; verify against installed APIs. -->

# Services

Source: https://zenbulabs.mintlify.app/core/services

A service is a class that extends `Service.create()` from `@zenbujs/core/runtime`. It runs in the main process.

```typescript src/main/services/files.ts theme={null}
import { Service } from "@zenbujs/core/runtime"
import fs from "fs/promises"

export class FilesService extends Service.create({
  key: "files",
}) {
  evaluate() {
    // Called when the service starts.
  }

  async readFile(args: { path: string }) {
    return fs.readFile(args.path, "utf-8")
  }

  async writeFile(args: { path: string; content: string }) {
    await fs.writeFile(args.path, args.content)
  }
}
```

Every public method is automatically exposed to the renderer process via RPC. You call them through `rpc.<plugin>.<service>.<method>`, so if this service belongs to a plugin named `app`, `readFile` is available as `rpc.app.files.readFile(...)`.

## Calling from React

```typescript theme={null}
import { useRpc } from "@zenbujs/core/react"

function Editor() {
  const rpc = useRpc()

  const load = async () => {
    const content = await rpc.app.files.readFile({ path: "/path/to/file.txt" })
    console.log(content)
  }

  return <button onClick={load}>Load</button>
}
```

The call is fully type-safe. Parameters and return types are inferred from the service class.

## Dependencies

Services declare dependencies on other services through the `deps` field. The framework automatically figures out the right order to start them in, so each service's dependencies are ready before it runs.

```typescript theme={null}
import { Service } from "@zenbujs/core/runtime"
import { WindowService } from "@zenbujs/core/services"

export class InitService extends Service.create({
  key: "init",
  deps: { window: WindowService },
}) {
  async evaluate() {
    await this.ctx.window.openWindow({})
  }
}
```

`openWindow({})` boots a main window pointed at your `uiEntrypoint`. Pass `injection: "<name>"` to open a window whose entry route renders a specific [injection](/core/injections) instead.

By the time `evaluate()` runs, all dependencies in `this.ctx` are fully initialized.

## Setups and cleanups

Inside `evaluate()`, anything that needs to be torn down on hot reload or shutdown should be wrapped in `this.setup()`:

```typescript theme={null}
evaluate() {
  this.setup("interval", () => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  })
}
```

The returned function is the cleanup. It runs before the next setup with the same name, or when the service is torn down.

## Hot reloading

When you edit a service file and save, the framework re-evaluates affected services automatically. This works in both development and production.
