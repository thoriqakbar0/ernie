import {
  parseModelResult,
  parseModelsResult,
  parseRlmDepthResult,
  parseSavedSessionsResult,
  parseSessionRenameResult,
  parseSessionResult,
  parseSkillsResult,
  parseTaskReceiptResult,
  parseWorkspaceResult,
} from './lib/protocol';

import type {
  PrimeAgentModel,
  PrimeAgentModelSelection,
  PrimeAgentResult,
  PrimeAgentRlmDepth,
  PrimeAgentRlmDepthSelection,
  PrimeAgentSavedSession,
  PrimeAgentSession,
  PrimeAgentSessionActivity,
  PrimeAgentSessionCreation,
  PrimeAgentSessionRename,
  PrimeAgentSessionRenameReceipt,
  PrimeAgentSkill,
  PrimeAgentTaskReceipt,
  PrimeAgentTaskSubmission,
  PrimeAgentWorkspace,
} from './types';

const modelNameCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

function isGptModel(model: PrimeAgentModel): boolean {
  return /^gpt(?:[-\s]|$)/iu.test(model.name);
}

function orderModels(
  models: readonly PrimeAgentModel[],
): readonly PrimeAgentModel[] {
  return [...models].sort((left, right) => {
    const leftIsGpt = isGptModel(left);
    const rightIsGpt = isGptModel(right);
    if (leftIsGpt !== rightIsGpt) return leftIsGpt ? -1 : 1;
    if (!leftIsGpt) return 0;
    return modelNameCollator.compare(right.name, left.name);
  });
}

export type {
  PrimeAgentModel,
  PrimeAgentModelSelection,
  PrimeAgentResult,
  PrimeAgentRlmDepth,
  PrimeAgentRlmDepthSelection,
  PrimeAgentSavedSession,
  PrimeAgentSession,
  PrimeAgentSessionActivity,
  PrimeAgentSessionCreation,
  PrimeAgentSessionRename,
  PrimeAgentSessionRenameReceipt,
  PrimeAgentSkill,
  PrimeAgentTaskReceipt,
  PrimeAgentTaskSubmission,
  PrimeAgentWorkspace,
};

/** Parse a workspace response received from Electron's main process. */
export function parsePrimeAgentWorkspaceResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentWorkspace> {
  return parseWorkspaceResult(value);
}

/** Parse a newly created Agent session received from Electron's main process. */
export function parsePrimeAgentSessionResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentSession> {
  return parseSessionResult(value);
}

/** Parse a persisted Agent rename received from Electron's main process. */
export function parsePrimeAgentSessionRenameResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentSessionRenameReceipt> {
  return parseSessionRenameResult(value);
}

/** Parse saved sessions received from Electron's main process. */
export function parsePrimeAgentSavedSessionsResult(
  value: unknown,
): PrimeAgentResult<readonly PrimeAgentSavedSession[]> {
  return parseSavedSessionsResult(value);
}

/** Parse an Agent skill catalog received from Electron's main process. */
export function parsePrimeAgentSkillsResult(
  value: unknown,
): PrimeAgentResult<readonly PrimeAgentSkill[]> {
  return parseSkillsResult(value);
}

/** Parse a model-list response received from Electron's main process. */
export function parsePrimeAgentModelsResult(
  value: unknown,
): PrimeAgentResult<readonly PrimeAgentModel[]> {
  const result = parseModelsResult(value);
  return result.ok
    ? { ok: true, value: orderModels(result.value) }
    : result;
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

/** Parse a task receipt received from Electron's main process. */
export function parsePrimeAgentTaskReceiptResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentTaskReceipt> {
  return parseTaskReceiptResult(value);
}
