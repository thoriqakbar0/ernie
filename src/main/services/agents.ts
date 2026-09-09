import { PrimeDaemonUnavailableError } from "../prime-agent/daemon-unavailable"
import { PrimeAgentTransportUnavailableError } from "../prime-agent/command-availability"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { Service } from "@zenbujs/core/runtime"
import { app, dialog } from "electron"
import { Effect, Schema, Semaphore } from "effect"
import type { Agent } from "../../packages/agents"
import {
  AgentFailure,
  AgentSettings,
  Roster,
  decodeAgentInput,
  runAgentOperation,
} from "../../packages/agents"
import { AgentStoreService } from "./agent-store"
import { PrimeAgentService } from "../prime-agent/service"

const identity = Schema.Struct({ agentId: Schema.NullOr(Schema.NonEmptyString) })
const assignment = Schema.Struct({ ...identity.fields, sessionId: Schema.NonEmptyString })
const saveInput = Schema.Struct({
  expectedNativeName: Schema.optionalKey(Schema.String),
  expectedRevision: Schema.Natural,
  id: Schema.NonEmptyString,
  ...AgentSettings.fields,
})
const createInput = Schema.Struct({
  agentId: Schema.NonEmptyString,
  requestId: Schema.NonEmptyString,
})

const savedAgent = (
  data: Schema.Schema.Type<typeof saveInput>,
  previous: Agent | undefined,
): Agent => ({
  ...(previous?.root ? { root: previous.root } : {}),
  avatar: data.avatar,
  createdAt: previous?.createdAt ?? Date.now(),
  cwd: data.cwd,
  id: data.id,
  instructionRevision:
    (previous?.instructionRevision ?? 0) + (previous?.instructions === data.instructions ? 0 : 1),
  instructions: data.instructions,
  model: data.model,
  name: data.name.trim(),
  pinned: previous?.pinned ?? false,
  provider: data.provider,
  revision: (previous?.revision ?? 0) + 1,
  ...(data.rlmMaxDepth === undefined ? {} : { rlmMaxDepth: data.rlmMaxDepth }),
  role: data.role,
  ...(data.thinkingLevel === undefined ? {} : { thinkingLevel: data.thinkingLevel }),
})

const validateSavedSettings = (
  data: Schema.Schema.Type<typeof saveInput>,
  previous: Agent | undefined,
) =>
  Effect.gen(function* validateSettings() {
    if (
      (previous?.revision ?? 0) !== data.expectedRevision &&
      !(previous?.root?.status === "prepared" && previous.revision === data.expectedRevision + 1)
    ) {
      return yield* Effect.fail(
        new AgentFailure({
          message: "This Agent changed elsewhere. Reopen settings before saving.",
        }),
      )
    }
    if (
      previous?.root &&
      ["instructions", "cwd", "provider", "model", "thinkingLevel", "rlmMaxDepth"].some(
        (key) => previous[key as keyof Agent] !== data[key as keyof typeof data],
      )
    ) {
      return yield* Effect.fail(
        new AgentFailure({
          message:
            "This native root keeps its existing instructions and folder. Live changes are not supported yet.",
        }),
      )
    }
  })

/** Owns Agent editing, navigation, and organization through typed Zenbu RPC. */
export class AgentsService extends Service.create({
  deps: { prime: PrimeAgentService, store: AgentStoreService },
  key: "agents",
}) {
  private readonly lock = Semaphore.makeUnsafe(1)

  /** Reads persisted identities and associations. */
  getRoster() {
    return runAgentOperation(this.ctx.store.read())
  }

  /** Removes roster membership while retaining native conversation files. */
  remove(input: { agentId: string }) {
    return runAgentOperation(
      this.lock.withPermit(
        Effect.gen({ self: this }, function* remove() {
          const data = yield* decodeAgentInput(
            Schema.Struct({ agentId: Schema.NonEmptyString }), input,
          )
          const roster = yield* this.ctx.store.read()
          yield* this.ctx.store.write({
            ...roster,
            agents: roster.agents.filter((agent) => agent.id !== data.agentId),
            associations: roster.associations.filter((item) => item.agentId !== data.agentId),
            selectedAgentId: roster.selectedAgentId === data.agentId ? null : roster.selectedAgentId,
          })
        }),
      ),
    )
  }

  /** Opens the local folder chooser; cancellation leaves the Agent's folder unchanged. */
  chooseWorkspace() {
    return runAgentOperation(
      Effect.tryPromise({
        catch: (cause) =>
          new AgentFailure({ cause, message: "The folder chooser could not open. Try again." }),
        try: async () => {
          // Browser development has no focused Electron window to bring the panel forward.
          const selection = dialog.showOpenDialog({
            buttonLabel: "Use this folder",
            defaultPath: app.getPath("home"),
            properties: ["openDirectory", "createDirectory"],
            title: "Where should your Agent work?",
          })
          app.focus({ steal: true })
          const result = await selection
          return result.canceled ? null : (result.filePaths[0] ?? null)
        },
      }),
    )
  }

  /** Saves settings with optimistic concurrency; retries reuse the identity. */
  save(input: Schema.Schema.Type<typeof saveInput>) {
    return runAgentOperation(
      this.lock.withPermit(
        Effect.gen({ self: this }, function* save() {
          const data = yield* decodeAgentInput(saveInput, input)
          if (
            !data.name.trim() ||
            !path.isAbsolute(data.cwd) ||
            Boolean(data.model) !== Boolean(data.provider)
          ) {
            return yield* Effect.fail(
              new AgentFailure({
                message:
                  "Enter a name, an absolute workspace path, and both model fields or neither.",
              }),
            )
          }
          const roster = yield* this.ctx.store.read()
          const previous = roster.agents.find((agent) => agent.id === data.id)
          const settingKeys = [
            "name",
            "avatar",
            "role",
            "instructions",
            "cwd",
            "provider",
            "model",
            "thinkingLevel",
            "rlmMaxDepth",
          ] as const
          if (
            previous?.revision === data.expectedRevision + 1 &&
            settingKeys.every((key) =>
              isDeepStrictEqual(previous[key], key === "name" ? data.name.trim() : data[key]),
            )
          ) {
            yield* this.ctx.store.write(roster)
            return previous.root ||
              !roster.associations.some((item) => item.agentId === previous.id)
              ? yield* this.ensureRoot(previous.id)
              : previous
          }
          yield* validateSavedSettings(data, previous)
          const previousRoot = previous?.root
          if (previousRoot) {
            yield* this.native(() =>
              this.ctx.prime.renameAgentRoot({
                ...previousRoot,
                expectedName: data.expectedNativeName,
                name: data.name.trim(),
              }),
            )
          }
          const agent = savedAgent(data, previous)
          yield* this.ctx.store.write({
            ...roster,
            agents: previous
              ? roster.agents.map((item) => (item.id === agent.id ? agent : item))
              : [...roster.agents, agent],
          })
          return !previous || previous.root ? yield* this.ensureRoot(agent.id) : agent
        }),
      ),
    )
  }

  /** Imports a saved profile without replacing existing identities or execution origins. */
  reconcileRoster(input: Roster) {
    return runAgentOperation(
      this.lock.withPermit(
        Effect.gen({ self: this }, function* reconcileRoster() {
          const incoming = yield* decodeAgentInput(Roster, input)
          const current = yield* this.ctx.store.read()
          const agents = [...current.agents]
          const associations = [...current.associations]
          for (const agent of incoming.agents) {
            const previous = agents.find((item) => item.id === agent.id)
            if (previous && !isDeepStrictEqual(previous, agent)) {
              return yield* Effect.fail(
                new AgentFailure({
                  message:
                    "An Agent identity conflicts with this profile. Resolve the saved records before importing.",
                }),
              )
            }
            if (!previous) {
              agents.push(agent)
            }
          }
          for (const association of incoming.associations) {
            const index = associations.findIndex((item) => item.sessionId === association.sessionId)
            const previous = associations[index]
            if (
              previous?.origin &&
              association.origin &&
              !isDeepStrictEqual(previous.origin, association.origin)
            ) {
              return yield* Effect.fail(
                new AgentFailure({
                  message:
                    "A conversation has conflicting original instructions. Resolve its saved origin before importing.",
                }),
              )
            }
            if (!previous) {
              associations.push(association)
            } else if (!previous.origin && association.origin) {
              associations[index] = { ...previous, origin: association.origin }
            }
          }
          const roots = agents.flatMap((agent) => (agent.root ? [agent.root.sessionId] : []))
          if (new Set(roots).size !== roots.length) {
            return yield* Effect.fail(
              new AgentFailure({
                message:
                  "Two Agent profiles refer to the same native root. Resolve the duplicate identity before importing.",
              }),
            )
          }
          if (
            associations.some(
              (item) => item.agentId && !agents.some((agent) => agent.id === item.agentId),
            )
          ) {
            return yield* Effect.fail(
              new AgentFailure({ message: "An imported conversation refers to a missing Agent." }),
            )
          }
          yield* this.ctx.store.write({ ...current, agents, associations })
          return {
            addedAgents: agents.length - current.agents.length,
            addedAssociations: associations.length - current.associations.length,
          }
        }),
      ),
    )
  }

  /** Pins without reordering the underlying roster or responding to activity. */
  pin(input: { agentId: string; pinned: boolean }) {
    return runAgentOperation(
      this.lock.withPermit(
        Effect.gen({ self: this }, function* pin() {
          const data = yield* decodeAgentInput(
            Schema.Struct({ agentId: Schema.NonEmptyString, pinned: Schema.Boolean }),
            input,
          )
          const roster = yield* this.ctx.store.read()
          if (!roster.agents.some((agent) => agent.id === data.agentId)) {
            return yield* Effect.fail(new AgentFailure({ message: "This Agent is unavailable." }))
          }
          yield* this.ctx.store.write({
            ...roster,
            agents: roster.agents.map((agent) =>
              agent.id === data.agentId ? { ...agent, pinned: data.pinned } : agent,
            ),
          })
        }),
      ),
    )
  }

  /** Selects the bound native root, or asks for a legacy root choice. */
  select(input: Schema.Schema.Type<typeof identity>) {
    return runAgentOperation(
      this.lock.withPermit(
        Effect.gen({ self: this }, function* select() {
          const { agentId } = yield* decodeAgentInput(identity, input)
          const roster = yield* this.ctx.store.read()
          const agent = roster.agents.find((item) => item.id === agentId)
          if (agentId && !agent) {
            return yield* Effect.fail(new AgentFailure({ message: "This Agent is unavailable." }))
          }
          yield* this.ctx.store.write({ ...roster, selectedAgentId: agentId })
          if (!agent) {
            yield* this.native(() => this.ctx.prime.selectSession({}))
            return
          }
          const legacy = roster.associations.filter((item) => item.agentId === agentId)
          if (!agent.root && legacy.length > 1) {
            yield* this.native(() => this.ctx.prime.selectSession({}))
            return
          }
          // Keep the current conversation mounted until root activation selects its replacement.
          yield* this.ensureRoot(agent.id)
        }),
      ),
    )
  }

  /** Selects one conversation and records recency without changing execution. */
  openConversation(input: { sessionId: string }) {
    return runAgentOperation(
      this.lock.withPermit(
        Effect.gen({ self: this }, function* openConversation() {
          const { sessionId } = yield* decodeAgentInput(
            Schema.Struct({ sessionId: Schema.NonEmptyString }),
            input,
          )
          const roster = yield* this.ctx.store.read()
          const existing = roster.associations.find((item) => item.sessionId === sessionId)
          yield* this.native(() => this.ctx.prime.selectSession({ sessionId }))
          yield* this.ctx.store.write({
            ...roster,
            associations: [
              ...roster.associations.filter((item) => item.sessionId !== sessionId),
              { ...existing, agentId: existing?.agentId ?? null, sessionId, visitedAt: Date.now() },
            ],
            selectedAgentId:
              roster.agents.find((agent) => agent.root?.sessionId === sessionId)?.id ?? null,
          })
        }),
      ),
    )
  }

  /** Changes only organization; immutable origin and runtime remain untouched. */
  assign(input: Schema.Schema.Type<typeof assignment>) {
    return runAgentOperation(
      this.lock.withPermit(
        Effect.gen({ self: this }, function* assign() {
          const { sessionId, agentId } = yield* decodeAgentInput(assignment, input)
          const roster = yield* this.ctx.store.read()
          if (agentId && !roster.agents.some((agent) => agent.id === agentId)) {
            return yield* Effect.fail(new AgentFailure({ message: "This Agent is unavailable." }))
          }
          if (
            roster.agents.some(
              (item) => item.root?.sessionId === sessionId || (item.id === agentId && item.root),
            )
          ) {
            return yield* Effect.fail(
              new AgentFailure({ message: "Native roots cannot be reassigned to another Agent." }),
            )
          }
          const catalog = yield* this.native(() => this.ctx.prime.getSessionState())
          if (!catalog.sessions.some((session) => session.id === sessionId)) {
            return yield* Effect.fail(
              new AgentFailure({ message: "This conversation is unavailable." }),
            )
          }
          const previous = roster.associations.find((item) => item.sessionId === sessionId)
          yield* this.ctx.store.write({
            ...roster,
            associations: [
              ...roster.associations.filter((item) => item.sessionId !== sessionId),
              { ...previous, agentId, sessionId, visitedAt: previous?.visitedAt ?? Date.now() },
            ],
            selectedAgentId:
              catalog.selectedSessionId === sessionId ? agentId : roster.selectedAgentId,
          })
        }),
      ),
    )
  }

  /** Compatibility command for first-send receipts; always resolves the Agent’s single root. */
  createConversation(input: Schema.Schema.Type<typeof createInput>) {
    return runAgentOperation(
      this.lock.withPermit(
        Effect.gen({ self: this }, function* createConversation() {
          const data = yield* decodeAgentInput(createInput, input)
          const agent = yield* this.ensureRoot(data.agentId)
          return agent.root.sessionId
        }),
      ),
    )
  }

  /** Explicitly chooses the native root of a legacy profile while preserving every association. */
  bindRoot(input: { agentId: string; sessionId: string }) {
    return runAgentOperation(
      this.lock.withPermit(
        Effect.gen({ self: this }, function* bindRoot() {
          const data = yield* decodeAgentInput(
            Schema.Struct({ agentId: Schema.NonEmptyString, sessionId: Schema.NonEmptyString }),
            input,
          )
          const roster = yield* this.ctx.store.read()
          const agent = roster.agents.find((item) => item.id === data.agentId)
          if (
            !agent ||
            agent.root ||
            !roster.associations.some(
              (item) => item.agentId === data.agentId && item.sessionId === data.sessionId,
            )
          ) {
            return yield* Effect.fail(
              new AgentFailure({ message: "Choose an unbound Agent’s existing session." }),
            )
          }
          yield* this.bindLegacyRoot(agent, data.sessionId)
          return yield* this.ensureRoot(agent.id)
        }),
      ),
    )
  }

  private bindLegacyRoot = Effect.fn("Agents.bindLegacyRoot")((agent: Agent, sessionId: string) =>
    Effect.gen({ self: this }, function* bindLegacyRoot() {
      const native = yield* this.native(() => this.ctx.prime.inspectAgentRoot({ sessionId }))
      const roster = yield* this.ctx.store.read()
      if (
        roster.agents.some((item) => item.id !== agent.id && item.root?.sessionId === sessionId)
      ) {
        return yield* Effect.fail(
          new AgentFailure({ message: "This native root already belongs to another Agent." }),
        )
      }
      const origin = roster.associations.find((item) => item.sessionId === sessionId)?.origin
      const bound = {
        ...agent,
        cwd: native.cwd,
        instructions: origin?.instructions ?? "",
        model: origin?.model ?? "",
        name: native.name ?? agent.name,
        provider: origin?.provider ?? "",
        root: { sessionFile: native.sessionFile, sessionId, status: "bound" as const },
      }
      yield* this.ctx.store.write({
        ...roster,
        agents: roster.agents.map((item) => (item.id === agent.id ? bound : item)),
      })
      return bound
    }),
  )

  private ensureRoot = Effect.fn("Agents.ensureRoot")((agentId: string) =>
    Effect.gen({ self: this }, function* ensureRoot() {
      let roster = yield* this.ctx.store.read()
      let agent = roster.agents.find((item) => item.id === agentId)
      if (!agent) {
        return yield* Effect.fail(new AgentFailure({ message: "This Agent is unavailable." }))
      }
      if (!agent.root) {
        const legacy = roster.associations.filter((item) => item.agentId === agentId)
        if (legacy.length > 1) {
          return yield* Effect.fail(
            new AgentFailure({
              message: "Choose which existing session should be this Agent’s root.",
            }),
          )
        }
        if (legacy[0]) {
          agent = yield* this.bindLegacyRoot(agent, legacy[0].sessionId)
        } else {
          const { cwd, name } = agent
          const root = yield* this.native(() =>
            this.ctx.prime.prepareAgentRoot({ agentId, cwd, name }),
          )
          const preparedAgent = { ...agent, root }
          agent = preparedAgent
          const origin = {
            agentId,
            cwd: agent.cwd,
            instructionRevision: agent.instructionRevision,
            instructions: agent.instructions,
            model: agent.model,
            provider: agent.provider,
            ...(agent.rlmMaxDepth === undefined ? {} : { rlmMaxDepth: agent.rlmMaxDepth }),
            ...(agent.thinkingLevel === undefined ? {} : { thinkingLevel: agent.thinkingLevel }),
          }
          // Commit the durable file identity before daemon admission, including uncertain responses.
          yield* this.ctx.store.write({
            ...roster,
            agents: roster.agents.map((item) => (item.id === agentId ? preparedAgent : item)),
            associations: [
              ...roster.associations,
              { agentId, origin, sessionId: root.sessionId, visitedAt: Date.now() },
            ],
          })
        }
      }
      roster = yield* this.ctx.store.read()
      const { root, name } = agent
      if (!root) {
        return yield* Effect.die(new Error("Agent root was not prepared."))
      }
      const origin = roster.associations.find((item) => item.sessionId === root.sessionId)?.origin
      const native = yield* this.native(() =>
        this.ctx.prime.activateAgentRoot({
          ...root,
          name,
          origin,
          prepared: root.status === "prepared",
        }),
      )
      const bound = {
        ...agent,
        name: native?.name ?? agent.name,
        root: { ...root, status: "bound" as const },
      }
      roster = yield* this.ctx.store.read()
      yield* this.ctx.store.write({
        ...roster,
        agents: roster.agents.map((item) => (item.id === agentId ? bound : item)),
        selectedAgentId: agentId,
      })
      return bound
    }),
  )

  private native = Effect.fn("Agents.native")(<A>(operation: () => Promise<A>) =>
    Effect.tryPromise({
      catch: (cause) =>
        new AgentFailure({
          cause,
          ...(cause instanceof PrimeDaemonUnavailableError ||
          cause instanceof PrimeAgentTransportUnavailableError
            ? { reason: "connection" as const }
            : {}),
          message:
            cause instanceof Error
              ? cause.message
              : "Prime Agent could not apply this action. Your input is kept; try again.",
        }),
      try: operation,
    }),
  )
}
