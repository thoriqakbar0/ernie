import { Schema } from "effect"

/** Versioned local protocol; content fields are data, never executable instructions. */
export const protocolVersion = 1
/** Expected failures shared by the host, UI, and agent adapters. */
export const FailureCode = Schema.Literals([
  "history_unavailable", "unsupported_workspace", "capture_failed", "files_changing",
  "checkpoint_incomplete", "checkpoint_incompatible", "proposal_stale", "active_customization",
  "approval_required", "dependency_failed", "storage_limit", "invalid_request",
])
/** A typed, serializable error with an actionable recovery hint. */
export class HistoryFailure extends Schema.TaggedError<HistoryFailure>()("HistoryFailure", {
  code: FailureCode, message: Schema.String, nextAction: Schema.String,
}) {}
/** Origins describe capture evidence rather than inferred authorship. */
export const Origin = Schema.Literals(["baseline", "customization", "external", "manual", "before_restore", "official_update", "launch"])
/** Manifest paths are revalidated against the immutable host policy on every read. */
export const FileEntry = Schema.Struct({ path: Schema.String, hash: Schema.String, size: Schema.Number, executable: Schema.Boolean })
/** Checkpoint metadata is durable only after all referenced objects exist. */
export const Checkpoint = Schema.Struct({
  id: Schema.String, tree: Schema.String, createdAt: Schema.String, origin: Origin,
  title: Schema.String, operationId: Schema.optional(Schema.String),
  hostVersion: Schema.String, dataGeneration: Schema.Number,
  knownWorking: Schema.Boolean, kept: Schema.Boolean,
  files: Schema.Array(FileEntry),
})
export type Checkpoint = typeof Checkpoint.Type
/** One registered edit interval, without a claim of exclusive file authorship. */
export const Customization = Schema.Struct({
  id: Schema.String, baselineId: Schema.String, workspace: Schema.String, startedAt: Schema.String,
  state: Schema.Literals(["editing", "finished"]), checkpointId: Schema.optional(Schema.String),
  overlapping: Schema.Boolean, summary: Schema.optional(Schema.String),
})
/** A proposal authorizes nothing until the independent host confirms its exact revision. */
export const RestoreProposal = Schema.Struct({
  id: Schema.String, checkpointId: Schema.String, currentTree: Schema.String,
  state: Schema.Literals(["awaiting_confirmation", "activating", "opening", "complete", "failed"]),
  previousGeneration: Schema.optional(Schema.String),
  previousCheckpointId: Schema.optional(Schema.String), error: Schema.optional(Schema.String),
})
/** Durable metadata is atomically replaced; source content lives in immutable objects. */
export const HistoryIndex = Schema.Struct({
  version: Schema.Literal(1), checkpoints: Schema.Array(Checkpoint),
  operations: Schema.Array(Customization), proposals: Schema.Array(RestoreProposal),
  receipts: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  inactiveGenerations: Schema.optional(Schema.Array(Schema.Struct({ path: Schema.String, tree: Schema.String, changed: Schema.Boolean }))),
  activeGeneration: Schema.String, currentCheckpointId: Schema.optional(Schema.String),
  lastKnownWorkingId: Schema.optional(Schema.String), lastRecoveryId: Schema.optional(Schema.String),
})
export type HistoryIndex = typeof HistoryIndex.Type
/** Narrow public command grammar. Activation is intentionally absent. */
export const HistoryRequest = Schema.Union([
  Schema.Struct({ method: Schema.Literal("history.status") }),
  Schema.Struct({ method: Schema.Literal("history.open") }),
  Schema.Struct({ method: Schema.Literal("history.list"), cursor: Schema.optional(Schema.String) }),
  Schema.Struct({ method: Schema.Literal("history.inspect"), checkpointId: Schema.String }),
  Schema.Struct({ method: Schema.Literal("history.diff"), checkpointId: Schema.String, cursor: Schema.optional(Schema.String), path: Schema.optional(Schema.String), offset: Schema.optional(Schema.Natural), expectedTree: Schema.optional(Schema.String), againstCheckpointId: Schema.optional(Schema.String) }),
  Schema.Struct({ method: Schema.Literal("history.checkpoint"), requestId: Schema.String, title: Schema.String }),
  Schema.Struct({ method: Schema.Literal("history.keep"), checkpointId: Schema.String, kept: Schema.Boolean }),
  Schema.Struct({ method: Schema.Literal("customization.begin"), requestId: Schema.String }),
  Schema.Struct({ method: Schema.Literal("customization.finish"), operationId: Schema.String, summary: Schema.String }),
  Schema.Struct({ method: Schema.Literal("history.prepare_restore"), checkpointId: Schema.String, requestId: Schema.String }),
  Schema.Struct({ method: Schema.Literal("history.request_restore"), proposalId: Schema.String }),
  Schema.Struct({ method: Schema.Literal("history.operation_status"), operationId: Schema.String }),
])
export type HistoryRequest = typeof HistoryRequest.Type

/** Concise controller projection used by both history presentations. */
export const CheckpointSummary = Schema.Struct({
  id: Schema.String, tree: Schema.String, title: Schema.String, proposedTitle: Schema.NullOr(Schema.String), createdAt: Schema.String,
  origin: Origin, captureOrigin: Schema.optional(Origin), customizations: Schema.optional(Schema.Array(Customization)), complete: Schema.Boolean, fileCount: Schema.Number, changedFileCount: Schema.Number,
  knownWorking: Schema.Boolean, kept: Schema.Boolean, restorable: Schema.Boolean, reason: Schema.NullOr(Schema.String),
})
export type CheckpointSummary = typeof CheckpointSummary.Type
export const CheckpointPage = Schema.Struct({ items: Schema.Array(CheckpointSummary), cursor: Schema.NullOr(Schema.String) })
export const HistoryStatus = Schema.Struct({
  workspace: Schema.String, currentCheckpointId: Schema.NullOr(Schema.String), unsavedChanges: Schema.NullOr(Schema.Boolean),
  lastRecoveryId: Schema.NullOr(Schema.String), captureError: Schema.NullOr(Schema.Struct({ message: Schema.String })),
})
export const HistoryResponse = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), value: Schema.Unknown }),
  Schema.Struct({ ok: Schema.Literal(false), error: Schema.Struct({ code: Schema.String, message: Schema.String, nextAction: Schema.optional(Schema.String) }) }),
])
export const FileChanges = Schema.Struct({ items: Schema.Array(Schema.Struct({ path: Schema.String, change: Schema.String })), cursor: Schema.NullOr(Schema.String), total: Schema.Number })
