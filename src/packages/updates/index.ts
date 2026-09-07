import { Schema } from "effect"

/** Public update state contains no local paths or transport errors. */
export const UpdateState = Schema.Union([
  Schema.Struct({ phase: Schema.Literal("disabled") }),
  Schema.Struct({ phase: Schema.Literal("idle") }),
  Schema.Struct({ phase: Schema.Literal("checking") }),
  Schema.Struct({ phase: Schema.Literal("available"), version: Schema.String, revision: Schema.String }),
  Schema.Struct({ phase: Schema.Literal("preparing") }),
  Schema.Struct({ phase: Schema.Literal("restarting") }),
  Schema.Struct({ phase: Schema.Literal("error"), message: Schema.String }),
])
/** Serializable state returned by the update service. */
export type UpdateState = typeof UpdateState.Type

/** Release manifests must identify Ernie and explicitly declare host compatibility. */
export const ReleaseManifest = Schema.Struct({ name: Schema.Literal("ernie"), version: Schema.String, zenbu: Schema.Struct({ host: Schema.String }) })
