import { readFile } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { Service } from "@zenbujs/core/runtime"
import { DbService } from "@zenbujs/core/services"
import { Effect, Schema } from "effect"
import { AgentFailure, Roster, decodeAgentInput } from "../../packages/agents"

const persistedRoster = Schema.Struct({
  app: Schema.Struct({ roster: Roster, rosterWriteId: Schema.String }),
})
/** Owns durable Agent data. This adapter never controls Prime Agent execution. */
export class AgentStoreService extends Service.create({
  deps: { db: DbService },
  key: "agentStore",
}) {
  /** Keeps prepared native session files beside this profile’s durable roster. */
  rootDirectory() {
    return path.join(this.ctx.db.dbPath, "native-roots")
  }

  /** Reads and parses the Zenbu field at the persistence boundary. */
  read = Effect.fn("AgentStore.read")(() =>
    decodeAgentInput(Roster, this.ctx.db.client.readRoot().app.roster),
  )

  /** Verifies disk acknowledgement because Zenbu 0.6 logs and swallows flush failures. */
  write = Effect.fn("AgentStore.write")((input: Roster) =>
    Effect.gen({ self: this }, function* write() {
      const roster = yield* decodeAgentInput(Roster, input)
      const writeId = crypto.randomUUID()
      yield* Effect.tryPromise({
        catch: (cause) =>
          new AgentFailure({ cause, message: "The Agent changes could not be saved. Try again." }),
        try: async () => {
          // A fresh token makes retries write even when the in-memory roster already matches.
          await this.ctx.db.client.update((root) => {
            root.app.roster = roster
            root.app.rosterWriteId = writeId
          })
          if (!this.ctx.db.db) {
            throw new Error("Agent database is unavailable")
          }
          await this.ctx.db.db.flush()
          const saved = Schema.decodeUnknownSync(persistedRoster)(
            JSON.parse(await readFile(path.join(this.ctx.db.dbPath, "root.json"), "utf-8")),
          )
          if (saved.app.rosterWriteId !== writeId || !isDeepStrictEqual(saved.app.roster, roster)) {
            throw new Error("Agent database did not acknowledge this write")
          }
        },
      })
    }),
  )
}
