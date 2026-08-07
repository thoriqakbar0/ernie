/** Source of a slash command exposed by Prime Agent. */
export type AgentCommandSource = "extension" | "prompt" | "skill";

/** Renderer-safe projection of one available Prime Agent slash command. */
export interface AgentSlashCommand {
  readonly name: string;
  readonly description?: string;
  readonly source: AgentCommandSource;
}
