import {
  parseModelResult,
  parseModelsResult,
  parseRlmDepthResult,
  parseWorkspaceResult,
} from './lib/protocol';

import type {
  PrimeAgentModel,
  PrimeAgentModelSelection,
  PrimeAgentResult,
  PrimeAgentRlmDepth,
  PrimeAgentRlmDepthSelection,
  PrimeAgentSession,
  PrimeAgentWorkspace,
} from './types';

export type {
  PrimeAgentModel,
  PrimeAgentModelSelection,
  PrimeAgentResult,
  PrimeAgentRlmDepth,
  PrimeAgentRlmDepthSelection,
  PrimeAgentSession,
  PrimeAgentWorkspace,
};

/** Parse a workspace response received from Electron's main process. */
export function parsePrimeAgentWorkspaceResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentWorkspace> {
  return parseWorkspaceResult(value);
}

/** Parse a model-list response received from Electron's main process. */
export function parsePrimeAgentModelsResult(
  value: unknown,
): PrimeAgentResult<readonly PrimeAgentModel[]> {
  return parseModelsResult(value);
}

/** Parse a model-change response received from Electron's main process. */
export function parsePrimeAgentModelResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentModel> {
  return parseModelResult(value);
}

/** Parse an RLM-depth response received from Electron's main process. */
export function parsePrimeAgentRlmDepthResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentRlmDepth> {
  return parseRlmDepthResult(value);
}
