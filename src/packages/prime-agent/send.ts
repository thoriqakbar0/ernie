import { Schema } from "effect"

/** Identity and immutable payload of one send, scoped to a receipt owner. */
const SendRequestSchema = Schema.Struct({
  commandId: Schema.NonEmptyString,
  content: Schema.String,
  epoch: Schema.NonEmptyString,
  mode: Schema.Literals(["prompt", "follow-up"]),
  sessionId: Schema.NonEmptyString,
})
/** Parsed send request crossing the renderer boundary. */
export type SendRequest = typeof SendRequestSchema.Type
export { SendRequestSchema as SendRequest }

/** Acknowledgement describes delivery only, never task completion. */
const SendReceiptSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal("accepted") }),
  Schema.Struct({ status: Schema.Literal("queued") }),
  Schema.Struct({ message: Schema.String, status: Schema.Literal("not-sent") }),
  Schema.Struct({ message: Schema.String, status: Schema.Literal("unknown") }),
])
/** Serializable send outcome; unknown forbids automatic native redelivery. */
export type SendReceipt = typeof SendReceiptSchema.Type
export { SendReceiptSchema as SendReceipt }
