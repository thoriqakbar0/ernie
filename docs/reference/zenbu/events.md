<!-- Cached upstream reference; verify against installed APIs. -->

# Events
Source: https://zenbulabs.mintlify.app/core/events



Events let the main process send messages to the renderer process. They're useful for things like push notifications, streaming output, or reacting to something that happened on the server side. Unlike RPC (where the renderer calls the main process and waits for a response), events are one-way: the main process fires them and any listener in the renderer process receives them.

## Defining events

You define events in a TypeScript file as a type with a name and payload for each event. This file needs to be registered in your config via `definePlugin({ events: "./src/main/events.ts" })` so the framework can keep everything type-safe.

```typescript src/main/events.ts theme={null}
export type Events = {
  todoCreated: { id: string; title: string }
  todoCompleted: { id: string }
  todoDeleted: { id: string }
}
```

## Emitting events

From a service, emit events through `this.ctx.rpc.emit`:

```typescript theme={null}
import { Service } from "@zenbujs/core/runtime"
import { RpcService } from "@zenbujs/core/services"

export class TodoService extends Service.create({
  key: "todo",
  deps: { rpc: RpcService },
}) {
  create(args: { title: string }) {
    const id = crypto.randomUUID()
    // ... create the todo
    // emit.<plugin name>.<event name>(payload)
    this.ctx.rpc.emit.app.todoCreated({ id, title: args.title })
  }
}
```

## Listening to events

From React, use the `useEvents` hook to subscribe:

```typescript theme={null}
import { useEvents } from "@zenbujs/core/react"

function Notifications() {
  const events = useEvents()

  useEffect(() => {
    const off = events.app.todoCreated.subscribe(({ title }) => {
      showToast(`New todo: ${title}`)
    })
    return off
  }, [events])

  return null
}
```

The returned function unsubscribes the listener, so return it from your effect's cleanup to avoid accumulating subscriptions across renders.

## Events vs RPC vs database

* **Events** are for transient updates that don't need to be persisted, like streaming terminal output or push notifications.
* **RPC** is for getting the main process to run code the renderer process can't, like reading a file or calling a system API.
* **Database** is for state that should persist and drive your UI.


