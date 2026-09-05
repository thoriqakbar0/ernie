import { Effect, Schema } from "effect"
import type { PrimeSessionSummary } from "../prime-agent"

/** Saved appearance choices in Ernie's original avatar family. */
export const Avatar = Schema.Literals(["fern", "tide", "ember", "iris"])
/** Editable defaults, applied only when a conversation is created. */
export const AgentSettings = Schema.Struct({
  name: Schema.NonEmptyString,
  avatar: Avatar,
  role: Schema.String,
  instructions: Schema.String,
  cwd: Schema.NonEmptyString,
  provider: Schema.String,
  model: Schema.String,
})
export interface AgentSettings extends Schema.Schema.Type<typeof AgentSettings> {}
/** Persistent identity, independent of name and workspace. */
export const Agent = Schema.Struct({
  ...AgentSettings.fields,
  id: Schema.NonEmptyString,
  revision: Schema.Natural,
  instructionRevision: Schema.Natural,
  pinned: Schema.Boolean,
  createdAt: Schema.Number,
})
export interface Agent extends Schema.Schema.Type<typeof Agent> {}
/** Immutable creation configuration; assignment never changes these fields. */
export const ConversationOrigin = Schema.Struct({
  agentId: Schema.NonEmptyString,
  instructionRevision: Schema.Natural,
  instructions: Schema.String,
  cwd: Schema.NonEmptyString,
  provider: Schema.String,
  model: Schema.String,
})
export interface ConversationOrigin extends Schema.Schema.Type<typeof ConversationOrigin> {}
/** Session association and last explicit navigation time. */
export const Association = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  creationId: Schema.optionalKey(Schema.NonEmptyString),
  agentId: Schema.NullOr(Schema.NonEmptyString),
  visitedAt: Schema.Number,
  origin: Schema.optionalKey(ConversationOrigin),
})
export interface Association extends Schema.Schema.Type<typeof Association> {}
/** One persisted roster snapshot. Existing sessions have no implicit association. */
export const Roster = Schema.Struct({
  agents: Schema.Array(Agent),
  associations: Schema.Array(Association),
  selectedAgentId: Schema.NullOr(Schema.NonEmptyString),
})
export interface Roster extends Schema.Schema.Type<typeof Roster> {}
/** Initial database value, containing no generated identities. */
export const emptyRoster: Roster = { agents: [], associations: [], selectedAgentId: null }
/** Expected mutation failure, projected without underlying runtime details. */
export class AgentFailure extends Schema.TaggedError<AgentFailure>()("AgentFailure", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}
/** JSON-safe RPC outcome. */
export type AgentResult<A> = { ok: true; value: A } | { ok: false; error: string }
/** Executes an Effect at the Zenbu Promise boundary. */
export function runAgentOperation<A>(operation: Effect.Effect<A, AgentFailure>): Promise<AgentResult<A>> {
  return Effect.runPromise(operation.pipe(Effect.match({
    onSuccess: (value): AgentResult<A> => ({ ok: true, value }),
    onFailure: (error): AgentResult<A> => ({ ok: false, error: error.message }),
  })))
}
/** Parses process and persistence input with an explicit failure value. */
export const decodeAgentInput = <A>(schema: Schema.Codec<A>, input: unknown) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(Effect.mapError((cause) =>
    new AgentFailure({ message: "The Agent data is invalid. Check the fields and try again.", cause })))
/** Aggregates concurrent authoritative states without inventing idle outcomes. */
export function describeAgentActivity(sessions: readonly PrimeSessionSummary[]) {
  const working = sessions.filter((session) => session.state === "working").length
  const recovering = sessions.filter((session) => session.state === "recovering").length
  const failed = sessions.filter((session) => session.workerFailed).length
  const counts = [working ? `${working} working` : "", recovering ? `${recovering} recovering` : "", failed ? `${failed} failed` : ""].filter(Boolean)
  if (working === 1 && !recovering && !failed) {
    const active = sessions.find((session) => session.state === "working")
    return active?.activitySummary ?? (active?.name ? `Working · ${active.name}` : "Working…")
  }
  if (counts.length) return counts.join(" · ")
  const latest = [...sessions].sort((a, b) => (b.activityAt ?? "").localeCompare(a.activityAt ?? ""))[0]
  return latest?.activitySummary ?? latest?.name ?? (latest ? "Untitled conversation" : "No conversations yet")
}
