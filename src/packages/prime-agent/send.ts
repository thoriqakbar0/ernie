import { Schema } from "effect"

/** Identity and immutable payload of one send, scoped to a receipt owner. */
export const SendRequest = Schema.Struct({
  epoch: Schema.NonEmptyString,
  commandId: Schema.NonEmptyString,
  sessionId: Schema.NonEmptyString,
  content: Schema.String,
  mode: Schema.Literals(["prompt", "follow-up"]),
})
/** Parsed send request crossing the renderer boundary. */
export type SendRequest = typeof SendRequest.Type

/** Acknowledgement describes delivery only, never task completion. */
export const SendReceipt = Schema.Union([
  Schema.Struct({ status: Schema.Literal("accepted") }),
  Schema.Struct({ status: Schema.Literal("queued") }),
  Schema.Struct({ status: Schema.Literal("not-sent"), message: Schema.String }),
  Schema.Struct({ status: Schema.Literal("unknown"), message: Schema.String }),
])
/** Serializable send outcome; unknown forbids automatic native redelivery. */
export type SendReceipt = typeof SendReceipt.Type
