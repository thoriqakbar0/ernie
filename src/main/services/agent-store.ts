import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { Service } from "@zenbujs/core/runtime"
import { DbService } from "@zenbujs/core/services"
import { Effect, Schema } from "effect"
import { AgentFailure, Roster, decodeAgentInput } from "../../packages/agents"

const persistedRoster = Schema.Struct({ app: Schema.Struct({ roster: Roster, rosterWriteId: Schema.String }) })
/** Owns durable Agent data. This adapter never controls Prime Agent execution. */
export class AgentStoreService extends Service.create({ key: "agentStore", deps: { db: DbService } }) {
  /** Reads and parses the Zenbu field at the persistence boundary. */
  read = Effect.fn("AgentStore.read")(() => decodeAgentInput(Roster, this.ctx.db.client.readRoot().app.roster))

  /** Verifies disk acknowledgement because Zenbu 0.6 logs and swallows flush failures. */
  write = Effect.fn("AgentStore.write")((input: Roster) => Effect.gen({ self: this }, function* () {
    const roster = yield* decodeAgentInput(Roster, input)
    const writeId = crypto.randomUUID()
    yield* Effect.tryPromise({
      try: async () => {
        // A fresh token makes retries write even when the in-memory roster already matches.
        await this.ctx.db.client.update((root) => { root.app.roster = roster; root.app.rosterWriteId = writeId })
        if (!this.ctx.db.db) throw new Error("Agent database is unavailable")
        await this.ctx.db.db.flush()
        const saved = Schema.decodeUnknownSync(persistedRoster)(JSON.parse(await readFile(join(this.ctx.db.dbPath, "root.json"), "utf8")))
        if (saved.app.rosterWriteId !== writeId || !isDeepStrictEqual(saved.app.roster, roster)) throw new Error("Agent database did not acknowledge this write")
      },
      catch: (cause) => new AgentFailure({ message: "The Agent changes could not be saved. Try again.", cause }),
    })
  }))
}
