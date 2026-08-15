import {
  parseConfigurationResult,
  parseModelResult,
  parseModelsResult,
  parseRefinementReceiptResult,
  parseRlmDepthResult,
  parseSavedSessionsResult,
  parseSessionRenameResult,
  parseSessionHistoryPageResult,
  parseSessionHistoryRequest,
  parseSessionResult,
  parseSessionViewResult,
  parseSkillsResult,
  parseTaskReceiptResult,
  parseWorkspaceResult,
} from './lib/protocol.js';
import type { JsonValue } from '../json-value/index.js';

import type {
  PrimeAgentConfiguration,
  PrimeAgentModel,
  PrimeAgentModelCatalogScope,
  PrimeAgentChatMessage,
  PrimeAgentIpythonAttachment,
  PrimeAgentModelSelection,
  PrimeAgentResult,
  PrimeAgentRefinementReceipt,
  PrimeAgentRefinementRequest,
  PrimeAgentRlmDepth,
  PrimeAgentRlmDepthSelection,
  PrimeAgentSavedSession,
  PrimeAgentSession,
  PrimeAgentSessionActivity,
  PrimeAgentSessionCreation,
  PrimeAgentSessionHistoryPage,
  PrimeAgentSessionHistoryRequest,
  PrimeAgentSessionRename,
  PrimeAgentSessionRenameReceipt,
  PrimeAgentSessionView,
  PrimeAgentSpawnedSession,
  PrimeAgentSkill,
  PrimeAgentTaskReceipt,
  PrimeAgentTaskSubmission,
  PrimeAgentThinkingLevel,
  PrimeAgentThinkingLevelSelection,
  PrimeAgentTranscriptItem,
  PrimeAgentWorkspace,
} from './types.js';

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
  PrimeAgentConfiguration,
  PrimeAgentModel,
  PrimeAgentModelCatalogScope,
  PrimeAgentChatMessage,
  PrimeAgentIpythonAttachment,
  PrimeAgentModelSelection,
  PrimeAgentResult,
  PrimeAgentRefinementReceipt,
  PrimeAgentRefinementRequest,
  PrimeAgentRlmDepth,
  PrimeAgentRlmDepthSelection,
  PrimeAgentSavedSession,
  PrimeAgentSession,
  PrimeAgentSessionActivity,
  PrimeAgentSessionCreation,
  PrimeAgentSessionHistoryPage,
  PrimeAgentSessionHistoryRequest,
  PrimeAgentSessionRename,
  PrimeAgentSessionRenameReceipt,
  PrimeAgentSessionView,
  PrimeAgentSpawnedSession,
  PrimeAgentSkill,
  PrimeAgentTaskReceipt,
  PrimeAgentTaskSubmission,
  PrimeAgentThinkingLevel,
  PrimeAgentThinkingLevelSelection,
  PrimeAgentTranscriptItem,
  PrimeAgentWorkspace,
};

/** Parse a focused Agent snapshot received from Electron's main process. */
export function parsePrimeAgentSessionViewResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSessionView> {
  return parseSessionViewResult(value);
}

/** Parse one earlier transcript page received from Electron's main process. */
export function parsePrimeAgentSessionHistoryPageResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSessionHistoryPage> {
  return parseSessionHistoryPageResult(value);
}

/** Parse one bounded transcript-history request at the Electron boundary. */
export function parsePrimeAgentSessionHistoryRequest(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSessionHistoryRequest> {
  return parseSessionHistoryRequest(value);
}

/** Parse a workspace response received from Electron's main process. */
export function parsePrimeAgentWorkspaceResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentWorkspace> {
  return parseWorkspaceResult(value);
}

/** Parse a newly created Agent session received from Electron's main process. */
export function parsePrimeAgentSessionResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSession> {
  return parseSessionResult(value);
}

/** Parse a persisted Agent rename received from Electron's main process. */
export function parsePrimeAgentSessionRenameResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSessionRenameReceipt> {
  return parseSessionRenameResult(value);
}

/** Parse saved sessions received from Electron's main process. */
export function parsePrimeAgentSavedSessionsResult(
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentSavedSession[]> {
  return parseSavedSessionsResult(value);
}

/** Parse an Agent skill catalog received from Electron's main process. */
export function parsePrimeAgentSkillsResult(
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentSkill[]> {
  return parseSkillsResult(value);
}

/** Parse a model-list response received from Electron's main process. */
export function parsePrimeAgentModelsResult(
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentModel[]> {
  const result = parseModelsResult(value);
  return result.ok
    ? { ok: true, value: orderModels(result.value) }
    : result;
}

/** Parse a model-change response received from Electron's main process. */
export function parsePrimeAgentModelResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentModel> {
  return parseModelResult(value);
}

/** Parse active model configuration received from Electron's main process. */
export function parsePrimeAgentConfigurationResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentConfiguration> {
  return parseConfigurationResult(value);
}

/** Parse an RLM-depth response received from Electron's main process. */
export function parsePrimeAgentRlmDepthResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentRlmDepth> {
  return parseRlmDepthResult(value);
}

/** Parse a task receipt received from Electron's main process. */
export function parsePrimeAgentTaskReceiptResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentTaskReceipt> {
  return parseTaskReceiptResult(value);
}

/** Parse a refinement receipt received from Electron's main process. */
export function parsePrimeAgentRefinementReceiptResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentRefinementReceipt> {
  return parseRefinementReceiptResult(value);
}
