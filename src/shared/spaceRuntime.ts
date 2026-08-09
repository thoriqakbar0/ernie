import type { AgentCommand, AgentEvent, AgentState } from "./contract";

/** Catalog-owned identifier for an independently running project Space. */
export type SpaceId = string;

/** Canonical Prime Agent thinking level, ordered from least to most reasoning. */
export type AgentThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/** Renderer-safe, model-aware entry returned by Prime Agent. */
export interface AgentModelOption {
  readonly id: string;
  readonly label: string;
  readonly provider: string;
  readonly thinkingLevels: readonly AgentThinkingLevel[];
}

/** State for one Space-scoped Prime Agent runtime. */
export interface SpaceRuntimeState {
  readonly spaceId: SpaceId;
  readonly agent: AgentState;
  readonly rlmMaxDepth: number;
}

/** A command whose authority is limited to one cataloged Space. */
export interface SpaceAgentCommand {
  readonly spaceId: SpaceId;
  readonly command: AgentCommand;
}

/** Prime Agent event tagged with the Space that emitted it. */
export interface SpaceAgentEvent {
  readonly spaceId: SpaceId;
  readonly event: AgentEvent;
}

/** Atomic configuration and first prompt for a Space runtime. */
export interface StartSpaceInput {
  readonly spaceId: SpaceId;
  readonly prompt: string;
  readonly model: { readonly provider: string; readonly id: string };
  readonly thinkingLevel: AgentThinkingLevel;
  readonly rlmMaxDepth: number;
}
