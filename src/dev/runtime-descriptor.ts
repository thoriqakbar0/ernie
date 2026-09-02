import { Schema } from "effect"

export const RuntimeDescriptor = Schema.Struct({
  version: Schema.Literal(1),
  generation: Schema.NonEmptyString,
  ownerPid: Schema.Number,
  origin: Schema.NonEmptyString,
  authToken: Schema.NonEmptyString,
})

export type RuntimeDescriptor = typeof RuntimeDescriptor.Type

export const parseRuntimeDescriptor = Schema.decodeUnknownSync(RuntimeDescriptor)
