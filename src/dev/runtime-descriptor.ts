import { Schema } from "effect"

const RuntimeDescriptorSchema = Schema.Struct({
  authToken: Schema.NonEmptyString,
  generation: Schema.NonEmptyString,
  origin: Schema.NonEmptyString,
  ownerPid: Schema.Number,
  version: Schema.Literal(1),
})

export { RuntimeDescriptorSchema as RuntimeDescriptor }

export type RuntimeDescriptor = typeof RuntimeDescriptorSchema.Type

export const parseRuntimeDescriptor = Schema.decodeUnknownSync(RuntimeDescriptorSchema)
