import { Schema } from "effect"

/** Public update state contains no local paths or transport errors. */
const UpdateStateSchema = Schema.Union([
  Schema.Struct({ phase: Schema.Literal("disabled") }),
  Schema.Struct({ phase: Schema.Literal("idle") }),
  Schema.Struct({ phase: Schema.Literal("checking") }),
  Schema.Struct({
    phase: Schema.Literal("available"),
    revision: Schema.String,
    version: Schema.String,
  }),
  Schema.Struct({ phase: Schema.Literal("preparing") }),
  Schema.Struct({ phase: Schema.Literal("restarting") }),
  Schema.Struct({ message: Schema.String, phase: Schema.Literal("error") }),
])
/** Serializable state returned by the update service. */
export type UpdateState = typeof UpdateStateSchema.Type
export { UpdateStateSchema as UpdateState }

/** Release manifests must identify Ernie and explicitly declare host compatibility. */
export const ReleaseManifest = Schema.Struct({
  name: Schema.Literal("ernie"),
  version: Schema.String,
  zenbu: Schema.Struct({ host: Schema.String }),
})
