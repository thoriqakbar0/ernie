import * as Schema from "effect/Schema";

const BoundedSpaceId = Schema.String.check(Schema.isLengthBetween(1, 4_096));
const BoundedPrompt = Schema.String.check(Schema.isLengthBetween(1, 524_288));
const ModelProvider = Schema.String.check(Schema.isLengthBetween(1, 128));
const ModelId = Schema.String.check(Schema.isLengthBetween(1, 512));
const NonNegativeDepth = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const PromptCommand = Schema.Struct({
  type: Schema.Literal("prompt"),
  message: BoundedPrompt,
  behavior: Schema.optionalKey(Schema.Literals(["now", "steer", "followUp"])),
});
const SetExecutionTargetCommand = Schema.Struct({
  type: Schema.Literal("set_execution_target"),
  target: Schema.Literals(["local", "modal"]),
});
const ModelIdentitySchema = Schema.Struct({ provider: ModelProvider, id: ModelId });
const SetModelCommand = Schema.Struct({ type: Schema.Literal("set_model"), provider: ModelProvider, modelId: ModelId });
const SimpleCommand = Schema.Struct({
  type: Schema.Literals(["abort", "new_session", "compact", "cycle_model", "cycle_thinking_level", "refresh"]),
});
/** Parser for renderer-originated Prime Agent commands. */
export const AgentCommandSchema = Schema.Union([PromptCommand, SetExecutionTargetCommand, SetModelCommand, SimpleCommand]);

/** Parser for all Space-addressed requests. Cwd is intentionally absent. */
export const SpaceCommandSchema = Schema.Struct({ spaceId: BoundedSpaceId, command: AgentCommandSchema });
/** Parser for catalog-authorized Space identifiers. */
export const SpaceIdSchema = BoundedSpaceId;
/** Parser for the atomic configure-and-prompt flow. */
export const StartSpaceSchema = Schema.Struct({
  spaceId: BoundedSpaceId,
  prompt: BoundedPrompt,
  model: ModelIdentitySchema,
  rlmMaxDepth: NonNegativeDepth,
});
