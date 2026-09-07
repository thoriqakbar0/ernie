import { Effect, Schema } from "effect"
import { PrimeEffortSchema, PrimeRlmMaxDepthSchema } from "../prime-agent"

/** A saved recipe generates the same character on every surface and after reload. */
const GeneratedAvatar = Schema.Struct({ kind: Schema.Literal("generated"), seed: Schema.Natural })
/** Original characters remain readable alongside generated character recipes. */
const Avatar = Schema.Union([Schema.Literals(["fern", "tide", "ember", "iris"]), GeneratedAvatar])
/** Editable defaults, applied only when a conversation is created. */
const AgentSettingsSchema = Schema.Struct({
  avatar: Avatar,
  cwd: Schema.NonEmptyString,
  instructions: Schema.String,
  model: Schema.String,
  name: Schema.NonEmptyString,
  provider: Schema.String,
  rlmMaxDepth: Schema.optionalKey(PrimeRlmMaxDepthSchema),
  role: Schema.String,
  thinkingLevel: Schema.optionalKey(PrimeEffortSchema),
})
export { AgentSettingsSchema as AgentSettings }
export type AgentSettings = Schema.Schema.Type<typeof AgentSettingsSchema>
/** Durable native root binding; creation can be retried without allocating another session. */
const NativeRoot = Schema.Struct({
  sessionFile: Schema.NonEmptyString,
  sessionId: Schema.NonEmptyString,
  status: Schema.Literals(["prepared", "bound"]),
})
/** Persistent presentation identity, optionally bound to a native root. */
const AgentSchema = Schema.Struct({
  ...AgentSettingsSchema.fields,
  createdAt: Schema.Number,
  id: Schema.NonEmptyString,
  instructionRevision: Schema.Natural,
  pinned: Schema.Boolean,
  revision: Schema.Natural,
  root: Schema.optionalKey(NativeRoot),
})
export { AgentSchema as Agent }
export type Agent = Schema.Schema.Type<typeof AgentSchema>
/** Immutable creation configuration; assignment never changes these fields. */
const ConversationOriginSchema = Schema.Struct({
  agentId: Schema.NonEmptyString,
  cwd: Schema.NonEmptyString,
  instructionRevision: Schema.Natural,
  instructions: Schema.String,
  model: Schema.String,
  provider: Schema.String,
  rlmMaxDepth: Schema.optionalKey(PrimeRlmMaxDepthSchema),
  thinkingLevel: Schema.optionalKey(PrimeEffortSchema),
})
export { ConversationOriginSchema as ConversationOrigin }
export type ConversationOrigin = Schema.Schema.Type<typeof ConversationOriginSchema>
/** Session association and last explicit navigation time. */
const Association = Schema.Struct({
  agentId: Schema.NullOr(Schema.NonEmptyString),
  creationId: Schema.optionalKey(Schema.NonEmptyString),
  origin: Schema.optionalKey(ConversationOriginSchema),
  sessionId: Schema.NonEmptyString,
  visitedAt: Schema.Number,
})
/** One persisted roster snapshot. Existing sessions have no implicit association. */
const RosterSchema = Schema.Struct({
  agents: Schema.Array(AgentSchema),
  associations: Schema.Array(Association),
  selectedAgentId: Schema.NullOr(Schema.NonEmptyString),
})
export { RosterSchema as Roster }
export type Roster = Schema.Schema.Type<typeof RosterSchema>
/** Initial database value, containing no generated identities. */
export const emptyRoster: Roster = { agents: [], associations: [], selectedAgentId: null }
/** Expected mutation failure, projected without underlying runtime details. */
export class AgentFailure extends Schema.TaggedError<AgentFailure>()("AgentFailure", {
  cause: Schema.optionalKey(Schema.Defect()),
  message: Schema.String,
}) {}
/** JSON-safe RPC outcome. */
export type AgentResult<A> = { ok: true; value: A } | { ok: false; error: string }
/** Executes an Effect at the Zenbu Promise boundary. */
export const runAgentOperation = <A>(
  operation: Effect.Effect<A, AgentFailure>,
): Promise<AgentResult<A>> =>
  Effect.runPromise(
    operation.pipe(
      Effect.match({
        onFailure: (error): AgentResult<A> => ({ error: error.message, ok: false }),
        onSuccess: (value): AgentResult<A> => ({ ok: true, value }),
      }),
    ),
  )
/** Parses process and persistence input with an explicit failure value. */
export const decodeAgentInput = <A>(schema: Schema.Codec<A>, input: unknown) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(
      (cause) =>
        new AgentFailure({
          cause,
          message: "The Agent data is invalid. Check the fields and try again.",
        }),
    ),
  )
