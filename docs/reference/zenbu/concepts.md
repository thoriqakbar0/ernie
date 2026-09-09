<!-- Cached upstream reference; verify against installed APIs. -->

# Concepts

Source: https://zenbulabs.mintlify.app/concepts

Zenbu.js apps are Electron apps. The two processes you work with most are:

- **Main process** - a Node.js process that has access to the file system and operating system.
- **Renderer process** - a Chromium browser window that runs your React UI.

The two processes communicate through Zenbu's RPC and event system instead of raw [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc).

## Supported runtimes

| Runtime  | Status |
| -------- | ------ |
| Electron | ✅     |
| Tauri    | ⏳     |
| Web      | ⏳     |

## Plugins

Every Zenbu.js application is itself a plugin. Your app and any third-party plugin that extends it share the same set of capabilities. Everything described below applies equally to both.

## Services

Services are shared objects that run in the main process. They hold state, manage resources, and can depend on other services ([dependency injection](https://en.wikipedia.org/wiki/Dependency_injection)). Every public method on a service is automatically available to the renderer process via type-safe RPC.

```typescript src/main/services/counter.ts theme={null}
import { Service } from "@zenbujs/core/runtime"

export class CounterService extends Service.create({
  key: "counter",
}) {
  private count = 0

  evaluate() {
    // Called when the service starts.
  }

  increment() {
    this.count++
    return this.count
  }

  getCount() {
    return this.count
  }
}
```

When you edit a service file and save, `evaluate()` re-runs immediately without restarting the app.

## Database

Zenbu.js includes a JSON database that syncs across every process. Components that read from the database automatically re-render when the data they depend on changes.

```typescript theme={null}
import { useDb, useDbClient } from "@zenbujs/core/react"

function Counter() {
  const count = useDb(root => root.app.count)
  const client = useDbClient()

  return (
    <button onClick={() => {
      client.update(root => { root.app.count++ })
    }}>
      Count: {count}
    </button>
  )
}
```

## [RPC](https://en.wikipedia.org/wiki/Remote_procedure_call)

Every public method on a service becomes callable from the renderer process with full TypeScript inference. You define a service class in the main process and call it from React through `useRpc()`.

```typescript theme={null}
import { useRpc } from "@zenbujs/core/react"

function App() {
  const rpc = useRpc()

  const handleClick = async () => {
    const newCount = await rpc.app.counter.increment()
    console.log(newCount)
  }

  return <button onClick={handleClick}>Increment</button>
}
```

## Events

Services in the main process can emit events that the renderer process subscribes to. Events cross process boundaries automatically.

A service emits an event through `this.ctx.rpc.emit`:

```typescript src/main/services/notifications.ts theme={null}
export class NotificationService extends Service.create({
  key: "notifications",
}) {
  send(message: string) {
    this.ctx.rpc.emit.app.notification({ message })
  }
}
```

The renderer process listens with `useEvents()`:

```typescript theme={null}
import { useEvents } from "@zenbujs/core/react"
import { useEffect, useState } from "react"

function Notifications() {
  const events = useEvents()
  const [message, setMessage] = useState("")

  useEffect(() => {
    const unsubscribe = events.app.notification.subscribe((data) => {
      setMessage(data.message)
    })
    return unsubscribe
  }, [])

  return message ? <div className="toast">{message}</div> : null
}
```

## Injections

When a plugin wants to add UI to the app, it registers an [**injection**](/core/injections). The host already looks for injections in known places (sidebars, the bottom panel, the title bar, the footer) and renders them. A service registers one with `this.inject({ name, modulePath, meta })`, and any other plugin discovers it with `useInjections({ kind })` or renders it with `<View name="..." />`. The same primitive also covers [advice](/core/advice) and code that just needs to run at boot.
