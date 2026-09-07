<!-- Cached upstream reference; verify against installed APIs. -->

# Database
Source: https://zenbulabs.mintlify.app/core/state



Zenbu.js includes a JSON database that syncs across every process. Every process (main and renderer) holds an in-memory copy (also known as a replica) of the database. Reads are always local and synchronous. When a write happens in any process, it syncs to all other replicas automatically.

This means both the main process and the renderer read and write through the same interface. The only difference is how you access the client: through `DbService` in a service, or through React hooks in the renderer.

## Schema

Each plugin defines a schema using zod that describes the shape of its data.

```typescript src/main/schema.ts theme={null}
import { createSchema, z } from "@zenbujs/core/db"

export default createSchema({
  todos: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        done: z.boolean(),
      })
    )
    .default([]),
  settings: z
    .object({
      theme: z.string(),
      fontSize: z.number(),
    })
    .default({ theme: "dark", fontSize: 14 }),
})
```

Fields without a `default()` will be `undefined` initially. Use `.default()` to set an initial value for a field when the database is first created.

## Reading data

The database is a single JSON object called the `root`. Each plugin's data lives under its name, so `root.app` holds everything defined by the `app` plugin.

In the renderer, use the `useDb` hook to read from the database.

```typescript theme={null}
import { useDb } from "@zenbujs/core/react"

function TodoList() {
  const todos = useDb(root => root.app.todos)

  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  )
}
```

`useDb` is a subscription. When the selected value changes, the component re-renders automatically. Unrelated changes don't trigger re-renders.

In a service, read through `DbService.client`:

```typescript theme={null}
const root = this.ctx.db.client.readRoot()
const todos = root.app.todos
```

`readRoot()` returns a synchronous snapshot since the entire root is held in memory. You can also subscribe to a specific field to react when it changes:

```typescript theme={null}
const unsubscribe = this.ctx.db.client.app.todos.subscribe(todos => {
  console.log("todos changed", todos)
})
```

The returned function unsubscribes. Wrap it in `this.setup()` so it cleans up on hot reload.

## Writing data

In the renderer, use `useDbClient` to get a client that can write to the database:

```typescript theme={null}
import { useDbClient } from "@zenbujs/core/react"

function AddTodo() {
  const client = useDbClient()

  const add = () => {
    client.update(root => {
      root.app.todos.push({
        id: crypto.randomUUID(),
        title: "New todo",
        done: false,
      })
    })
  }

  return <button onClick={add}>Add</button>
}
```

In a service, write through `DbService.client`:

```typescript theme={null}
await this.ctx.db.client.update(root => {
  root.app.todos.push({
    id: crypto.randomUUID(),
    title: "New todo",
    createdAt: Date.now(),
  })
})
```

Inside `update()`, you mutate the root object directly, the same way you would with a regular JavaScript object. The database tracks these mutations and syncs them to other processes in the background.

## Collections

Regular data fields are always held in memory across every process. Collections are for data that can grow large (like agent messages or logs) and should only be loaded into memory when needed.

Define a collection in your schema with `collection(...)`:

```typescript src/main/schema.ts theme={null}
import { createSchema, collection, z } from "@zenbujs/core/db"

export default createSchema({
  messages: collection(
    z.object({
      text: z.string(),
      author: z.string(),
    }),
    { debugName: "messages" }
  ),
})
```

Collections are append-only. In a service, use `concat` to add items:

```typescript theme={null}
await this.ctx.db.client.app.messages.concat([
  { text: "Hello", author: "alice" },
])
```

In the renderer, use `useCollection` to subscribe to a collection's data:

```typescript theme={null}
import { useDb, useCollection } from "@zenbujs/core/react"

function Messages() {
  const messagesRef = useDb(root => root.app.messages)
  const { items, concat } = useCollection(messagesRef)
  const [text, setText] = useState("")

  return (
    <div>
      {items.map((msg, i) => (
        <div key={i}>{msg.author}: {msg.text}</div>
      ))}
      <input value={text} onChange={e => setText(e.target.value)} />
      <button onClick={() => {
        concat([{ text, author: "alice" }])
        setText("")
      }}>Send</button>
    </div>
  )
}
```

Collection data is only loaded into memory when you subscribe or read from it. This keeps the in-memory footprint small for data that can grow without bound.

## Blobs

Blobs store binary data (`Uint8Array`) like files or images. Like collections, they live on disk and are only loaded into memory when you read them.

Define a blob in your schema with `blob(...)`:

```typescript src/main/schema.ts theme={null}
import { createSchema, blob, z } from "@zenbujs/core/db"

export default createSchema({
  avatar: blob({ debugName: "avatar" }),
})
```

Write binary data with `set`:

```typescript theme={null}
const data = new TextEncoder().encode("hello")
await this.ctx.db.client.app.avatar.set(data)
```

Read it back with `read`:

```typescript theme={null}
const data = await this.ctx.db.client.app.avatar.read()
```

## Migrations

When you change your schema, existing databases need to be updated to match the new shape. Running `pnpm run db:generate` compares your current schema to the previous version and creates a migration file that describes what changed.

```bash theme={null}
pnpm run db:generate
```

The generated file is placed in your plugin's `migrations/` directory. Here's an example of what one looks like after adding a new `activeTabId` field to the schema:

```typescript migrations/0003.ts theme={null}
import type { KyjuMigration } from "@zenbu/kyju"

export const migration: KyjuMigration = {
  // Each migration increments the version number.
  version: 3,
  // The operations array describes the changes to apply.
  operations: [
    // "add" introduces a new key with a default value.
    { op: "add", key: "activeTabId", kind: "data", hasDefault: true, default: null },
  ],
}
```

Three operation types cover most schema changes:

* **add**: introduces a new key, optionally with a default value.
* **remove**: drops an existing key.
* **alter**: updates the metadata of an existing key, like changing its default.

For more complex changes, add a `migrate` function to transform the data with custom logic. Use `ctx.apply` to run the declared operations first, then modify the result:

```typescript migrations/0004.ts theme={null}
import type { KyjuMigration } from "@zenbu/kyju"

export const migration: KyjuMigration = {
  version: 4,
  operations: [
    { op: "add", key: "fullName", kind: "data", hasDefault: true, default: "" },
  ],
  migrate: (prev, { apply }) => {
    // Runs the auto-generated operations above
    const result = apply(prev)
    result.fullName = `${prev.firstName} ${prev.lastName}`
    return result
  },
}
```

Migrations run automatically when the app starts. Each migration runs at most once, and during development, adding or editing a migration file triggers a reload without restarting the app.
