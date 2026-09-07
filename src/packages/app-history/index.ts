import { Schema } from "effect"

/** Versioned local protocol; content fields are data, never executable instructions. */
export const protocolVersion = 1
/** Expected failures shared by the host, UI, and agent adapters. */
export const FailureCode = Schema.Literals([
  "history_unavailable",
  "unsupported_workspace",
  "capture_failed",
  "files_changing",
  "checkpoint_incomplete",
  "checkpoint_incompatible",
  "proposal_stale",
  "active_customization",
  "approval_required",
  "dependency_failed",
  "storage_limit",
  "invalid_request",
])
/** A typed, serializable error with an actionable recovery hint. */
export class HistoryFailure extends Schema.TaggedError<HistoryFailure>()("HistoryFailure", {
  code: FailureCode,
  message: Schema.String,
  nextAction: Schema.String,
}) {}
/** Origins describe capture evidence rather than inferred authorship. */
export const Origin = Schema.Literals([
  "baseline",
  "customization",
  "external",
  "manual",
  "before_restore",
  "official_update",
  "launch",
])
/** Manifest paths are revalidated against the immutable host policy on every read. */
export const FileEntry = Schema.Struct({
  executable: Schema.Boolean,
  hash: Schema.String,
  path: Schema.String,
  size: Schema.Number,
})
/** Checkpoint metadata is durable only after all referenced objects exist. */
const CheckpointSchema = Schema.Struct({
  createdAt: Schema.String,
  dataGeneration: Schema.Number,
  files: Schema.Array(FileEntry),
  hostVersion: Schema.String,
  id: Schema.String,
  kept: Schema.Boolean,
  knownWorking: Schema.Boolean,
  operationId: Schema.optional(Schema.String),
  origin: Origin,
  title: Schema.String,
  tree: Schema.String,
})
export { CheckpointSchema as Checkpoint }
export type Checkpoint = typeof CheckpointSchema.Type
/** One registered edit interval, without a claim of exclusive file authorship. */
export const Customization = Schema.Struct({
  baselineId: Schema.String,
  checkpointId: Schema.optional(Schema.String),
  id: Schema.String,
  overlapping: Schema.Boolean,
  startedAt: Schema.String,
  state: Schema.Literals(["editing", "finished"]),
  summary: Schema.optional(Schema.String),
  workspace: Schema.String,
})
/** A proposal authorizes nothing until the independent host confirms its exact revision. */
export const RestoreProposal = Schema.Struct({
  checkpointId: Schema.String,
  currentTree: Schema.String,
  error: Schema.optional(Schema.String),
  id: Schema.String,
  previousCheckpointId: Schema.optional(Schema.String),
  previousGeneration: Schema.optional(Schema.String),
  state: Schema.Literals(["awaiting_confirmation", "activating", "opening", "complete", "failed"]),
})
/** Durable metadata is atomically replaced; source content lives in immutable objects. */
const HistoryIndexSchema = Schema.Struct({
  activeGeneration: Schema.String,
  checkpoints: Schema.Array(CheckpointSchema),
  currentCheckpointId: Schema.optional(Schema.String),
  inactiveGenerations: Schema.optional(
    Schema.Array(
      Schema.Struct({ changed: Schema.Boolean, path: Schema.String, tree: Schema.String }),
    ),
  ),
  lastKnownWorkingId: Schema.optional(Schema.String),
  lastRecoveryId: Schema.optional(Schema.String),
  operations: Schema.Array(Customization),
  proposals: Schema.Array(RestoreProposal),
  receipts: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  version: Schema.Literal(1),
})
export { HistoryIndexSchema as HistoryIndex }
export type HistoryIndex = typeof HistoryIndexSchema.Type
/** Narrow public command grammar. Activation is intentionally absent. */
const HistoryRequestSchema = Schema.Union([
  Schema.Struct({ method: Schema.Literal("history.status") }),
  Schema.Struct({ method: Schema.Literal("history.open") }),
  Schema.Struct({ cursor: Schema.optional(Schema.String), method: Schema.Literal("history.list") }),
  Schema.Struct({ checkpointId: Schema.String, method: Schema.Literal("history.inspect") }),
  Schema.Struct({
    againstCheckpointId: Schema.optional(Schema.String),
    checkpointId: Schema.String,
    cursor: Schema.optional(Schema.String),
    expectedTree: Schema.optional(Schema.String),
    method: Schema.Literal("history.diff"),
    offset: Schema.optional(Schema.Natural),
    path: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    method: Schema.Literal("history.checkpoint"),
    requestId: Schema.String,
    title: Schema.String,
  }),
  Schema.Struct({
    checkpointId: Schema.String,
    kept: Schema.Boolean,
    method: Schema.Literal("history.keep"),
  }),
  Schema.Struct({ method: Schema.Literal("customization.begin"), requestId: Schema.String }),
  Schema.Struct({
    method: Schema.Literal("customization.finish"),
    operationId: Schema.String,
    summary: Schema.String,
  }),
  Schema.Struct({
    checkpointId: Schema.String,
    method: Schema.Literal("history.prepare_restore"),
    requestId: Schema.String,
  }),
  Schema.Struct({ method: Schema.Literal("history.request_restore"), proposalId: Schema.String }),
  Schema.Struct({ method: Schema.Literal("history.operation_status"), operationId: Schema.String }),
])
export { HistoryRequestSchema as HistoryRequest }
export type HistoryRequest = typeof HistoryRequestSchema.Type

/** Concise controller projection used by both history presentations. */
const CheckpointSummarySchema = Schema.Struct({
  captureOrigin: Schema.optional(Origin),
  changedFileCount: Schema.Number,
  complete: Schema.Boolean,
  createdAt: Schema.String,
  customizations: Schema.optional(Schema.Array(Customization)),
  fileCount: Schema.Number,
  id: Schema.String,
  kept: Schema.Boolean,
  knownWorking: Schema.Boolean,
  origin: Origin,
  proposedTitle: Schema.NullOr(Schema.String),
  reason: Schema.NullOr(Schema.String),
  restorable: Schema.Boolean,
  title: Schema.String,
  tree: Schema.String,
})
export { CheckpointSummarySchema as CheckpointSummary }
export type CheckpointSummary = typeof CheckpointSummarySchema.Type
export const CheckpointPage = Schema.Struct({
  cursor: Schema.NullOr(Schema.String),
  items: Schema.Array(CheckpointSummarySchema),
})
export const HistoryStatus = Schema.Struct({
  captureError: Schema.NullOr(Schema.Struct({ message: Schema.String })),
  currentCheckpointId: Schema.NullOr(Schema.String),
  lastRecoveryId: Schema.NullOr(Schema.String),
  unsavedChanges: Schema.NullOr(Schema.Boolean),
  workspace: Schema.String,
})
export const HistoryResponse = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), value: Schema.Unknown }),
  Schema.Struct({
    error: Schema.Struct({
      code: Schema.String,
      message: Schema.String,
      nextAction: Schema.optional(Schema.String),
    }),
    ok: Schema.Literal(false),
  }),
])
export const FileChanges = Schema.Struct({
  cursor: Schema.NullOr(Schema.String),
  items: Schema.Array(Schema.Struct({ change: Schema.String, path: Schema.String })),
  total: Schema.Number,
})
