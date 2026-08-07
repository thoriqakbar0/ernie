import * as Schema from "effect/Schema";

const PromptCommand = Schema.Struct({
  type: Schema.Literal("prompt"),
  message: Schema.String,
  behavior: Schema.optionalKey(Schema.Literals(["now", "steer", "followUp"])),
});
const SimpleCommand = Schema.Struct({
  type: Schema.Literals(["abort", "new_session", "compact", "cycle_model", "cycle_thinking_level", "refresh"]),
});
export const AgentCommandSchema = Schema.Union([PromptCommand, SimpleCommand]);
