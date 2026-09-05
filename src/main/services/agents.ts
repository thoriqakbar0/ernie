import { isAbsolute } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { Service } from "@zenbujs/core/runtime"
import { Effect, Schema, Semaphore } from "effect"
import { Agent, AgentFailure, AgentSettings, Roster, decodeAgentInput, runAgentOperation } from "../../packages/agents"
import { AgentStoreService } from "./agent-store"
import { PrimeAgentService } from "../prime-agent/service"

const identity = Schema.Struct({ agentId: Schema.NullOr(Schema.NonEmptyString) })
const assignment = Schema.Struct({ ...identity.fields, sessionId: Schema.NonEmptyString })
const saveInput = Schema.Struct({ id: Schema.NonEmptyString, expectedRevision: Schema.Natural, ...AgentSettings.fields })
const createInput = Schema.Struct({ agentId: Schema.NonEmptyString, requestId: Schema.NonEmptyString })

/** Owns Agent editing, navigation, and organization through typed Zenbu RPC. */
export class AgentsService extends Service.create({
  key: "agents", deps: { store: AgentStoreService, prime: PrimeAgentService },
}) {
  private readonly lock = Semaphore.makeUnsafe(1)

  /** Reads persisted identities and associations. */
  getRoster() { return runAgentOperation(this.ctx.store.read()) }

  /** Saves settings with optimistic concurrency; retries reuse the identity. */
  save(input: Schema.Schema.Type<typeof saveInput>) {
    return runAgentOperation(this.lock.withPermit(Effect.gen({ self: this }, function* () {
      const data = yield* decodeAgentInput(saveInput, input)
      if (!data.name.trim() || !isAbsolute(data.cwd) || Boolean(data.model) !== Boolean(data.provider)) {
        return yield* Effect.fail(new AgentFailure({ message: "Enter a name, an absolute workspace path, and both model fields or neither." }))
      }
      const roster = yield* this.ctx.store.read()
      const previous = roster.agents.find((agent) => agent.id === data.id)
      const settingKeys = ["name", "avatar", "role", "instructions", "cwd", "provider", "model"] as const
      if (previous?.revision === data.expectedRevision + 1 && settingKeys.every((key) => previous[key] === (key === "name" ? data.name.trim() : data[key]))) {
        yield* this.ctx.store.write(roster)
        return previous
      }
      if ((previous?.revision ?? 0) !== data.expectedRevision) {
        return yield* Effect.fail(new AgentFailure({ message: "This Agent changed elsewhere. Reopen settings before saving." }))
      }
      const agent: Agent = {
        id: data.id, name: data.name.trim(), avatar: data.avatar, role: data.role,
        instructions: data.instructions, cwd: data.cwd, provider: data.provider, model: data.model,
        revision: (previous?.revision ?? 0) + 1,
        instructionRevision: (previous?.instructionRevision ?? 0) + (previous?.instructions === data.instructions ? 0 : 1),
        pinned: previous?.pinned ?? false, createdAt: previous?.createdAt ?? Date.now(),
      }
      yield* this.ctx.store.write({ ...roster, agents: previous ? roster.agents.map((item) => item.id === agent.id ? agent : item) : [...roster.agents, agent] })
      return agent
    })))
  }

  /** Imports a saved profile without replacing existing identities or execution origins. */
  reconcileRoster(input: Roster) {
    return runAgentOperation(this.lock.withPermit(Effect.gen({ self: this }, function* () {
      const incoming = yield* decodeAgentInput(Roster, input)
      const current = yield* this.ctx.store.read()
      const agents = [...current.agents]
      const associations = [...current.associations]
      for (const agent of incoming.agents) {
        const previous = agents.find((item) => item.id === agent.id)
        if (previous && !isDeepStrictEqual(previous, agent)) return yield* Effect.fail(new AgentFailure({ message: "An Agent identity conflicts with this profile. Resolve the saved records before importing." }))
        if (!previous) agents.push(agent)
      }
      for (const association of incoming.associations) {
        const index = associations.findIndex((item) => item.sessionId === association.sessionId)
        const previous = associations[index]
        if (previous?.origin && association.origin && !isDeepStrictEqual(previous.origin, association.origin)) return yield* Effect.fail(new AgentFailure({ message: "A conversation has conflicting original instructions. Resolve its saved origin before importing." }))
        if (!previous) associations.push(association)
        else if (!previous.origin && association.origin) associations[index] = { ...previous, origin: association.origin }
      }
      if (associations.some((item) => item.agentId && !agents.some((agent) => agent.id === item.agentId))) return yield* Effect.fail(new AgentFailure({ message: "An imported conversation refers to a missing Agent." }))
      yield* this.ctx.store.write({ ...current, agents, associations })
      return { addedAgents: agents.length - current.agents.length, addedAssociations: associations.length - current.associations.length }
    })))
  }

  /** Pins without reordering the underlying roster or responding to activity. */
  pin(input: { agentId: string; pinned: boolean }) {
    return runAgentOperation(this.lock.withPermit(Effect.gen({ self: this }, function* () {
      const data = yield* decodeAgentInput(Schema.Struct({ agentId: Schema.NonEmptyString, pinned: Schema.Boolean }), input)
      const roster = yield* this.ctx.store.read()
      if (!roster.agents.some((agent) => agent.id === data.agentId)) return yield* Effect.fail(new AgentFailure({ message: "This Agent is unavailable." }))
      yield* this.ctx.store.write({ ...roster, agents: roster.agents.map((agent) => agent.id === data.agentId ? { ...agent, pinned: data.pinned } : agent) })
    })))
  }

  /** Selects an Agent's most recently visited conversation, or an empty workspace. */
  select(input: Schema.Schema.Type<typeof identity>) {
    return runAgentOperation(this.lock.withPermit(Effect.gen({ self: this }, function* () {
      const { agentId } = yield* decodeAgentInput(identity, input)
      const roster = yield* this.ctx.store.read()
      if (agentId && !roster.agents.some((agent) => agent.id === agentId)) return yield* Effect.fail(new AgentFailure({ message: "This Agent is unavailable." }))
      const catalog = yield* this.native(() => this.ctx.prime.getSessionState())
      const sessions = roster.associations.filter((item) => item.agentId === agentId && catalog.sessions.some((session) => session.id === item.sessionId))
      const latest = [...sessions].sort((a, b) => b.visitedAt - a.visitedAt)[0]
      yield* this.native(() => this.ctx.prime.selectSession(latest ? { sessionId: latest.sessionId } : {}))
      yield* this.ctx.store.write({ ...roster, selectedAgentId: agentId })
    })))
  }

  /** Selects one conversation and records recency without changing execution. */
  openConversation(input: { sessionId: string }) {
    return runAgentOperation(this.lock.withPermit(Effect.gen({ self: this }, function* () {
      const { sessionId } = yield* decodeAgentInput(Schema.Struct({ sessionId: Schema.NonEmptyString }), input)
      const roster = yield* this.ctx.store.read()
      const existing = roster.associations.find((item) => item.sessionId === sessionId)
      yield* this.native(() => this.ctx.prime.selectSession({ sessionId }))
      yield* this.ctx.store.write({ ...roster, selectedAgentId: existing?.agentId ?? null,
        associations: [...roster.associations.filter((item) => item.sessionId !== sessionId), { ...existing, sessionId, agentId: existing?.agentId ?? null, visitedAt: Date.now() }],
      })
    })))
  }

  /** Changes only organization; immutable origin and runtime remain untouched. */
  assign(input: Schema.Schema.Type<typeof assignment>) {
    return runAgentOperation(this.lock.withPermit(Effect.gen({ self: this }, function* () {
      const { sessionId, agentId } = yield* decodeAgentInput(assignment, input)
      const roster = yield* this.ctx.store.read()
      if (agentId && !roster.agents.some((agent) => agent.id === agentId)) return yield* Effect.fail(new AgentFailure({ message: "This Agent is unavailable." }))
      const catalog = yield* this.native(() => this.ctx.prime.getSessionState())
      if (!catalog.sessions.some((session) => session.id === sessionId)) return yield* Effect.fail(new AgentFailure({ message: "This conversation is unavailable." }))
      const previous = roster.associations.find((item) => item.sessionId === sessionId)
      yield* this.ctx.store.write({ ...roster,
        selectedAgentId: catalog.selectedSessionId === sessionId ? agentId : roster.selectedAgentId,
        associations: [...roster.associations.filter((item) => item.sessionId !== sessionId), { ...previous, sessionId, agentId, visitedAt: previous?.visitedAt ?? Date.now() }],
      })
    })))
  }

  /** Creates with native saved defaults; a failed assignment leaves the session in history. */
  createConversation(input: Schema.Schema.Type<typeof createInput>) {
    return runAgentOperation(this.lock.withPermit(Effect.gen({ self: this }, function* () {
      const data = yield* decodeAgentInput(createInput, input)
      const roster = yield* this.ctx.store.read()
      const agent = roster.agents.find((item) => item.id === data.agentId)
      if (!agent) return yield* Effect.fail(new AgentFailure({ message: "This Agent is unavailable." }))
      const previousCreation = roster.associations.find((item) => item.creationId === data.requestId)
      if (previousCreation?.origin && previousCreation.origin.agentId !== data.agentId) return yield* Effect.fail(new AgentFailure({ message: "This creation request belongs to another Agent." }))
      let sessionId = previousCreation?.sessionId
      if (!sessionId) {
        const session = yield* this.native(() => this.ctx.prime.createSession({ cwd: agent.cwd, name: "New Prime Agent session", creationId: data.requestId, origin: {
          agentId: agent.id, instructionRevision: agent.instructionRevision, instructions: agent.instructions,
          cwd: agent.cwd, provider: agent.provider, model: agent.model,
        } }))
        sessionId = session.id
      }
      const current = yield* this.ctx.store.read()
      const existing = current.associations.find((item) => item.sessionId === sessionId)
      yield* this.ctx.store.write({ ...current, selectedAgentId: agent.id,
        associations: [...current.associations.filter((item) => item.sessionId !== sessionId), { ...existing, sessionId, agentId: agent.id, visitedAt: Date.now() }],
      })
      yield* this.native(() => this.ctx.prime.selectSession({ sessionId }))
      return sessionId
    })))
  }

  private native = Effect.fn("Agents.native")(<A>(operation: () => Promise<A>) => Effect.tryPromise({
    try: operation,
    catch: (cause) => new AgentFailure({ message: "Prime Agent could not apply this action. Your input is kept; try again.", cause }),
  }))
}
