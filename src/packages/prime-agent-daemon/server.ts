export { createPrimeAgentDaemon } from './lib/daemon';
import type { JsonValue } from '../json-value';
import {
  parseCreatedSessionData,
  parseModelCatalogData,
  parseRefinementRequest,
  parseSavedSessionListData,
  parseSessionListData,
  parseSessionViewData,
  parseSkillResourceCatalogData,
  type PrimeAgentSkillResource,
} from './lib/protocol';

import type {
  PrimeAgentDaemon,
  PrimeAgentModel,
  PrimeAgentResult,
  PrimeAgentRefinementRequest,
  PrimeAgentSavedSession,
  PrimeAgentSession,
  PrimeAgentSessionView,
} from './types';

export type { PrimeAgentDaemon };

/** Parse a raw session-list payload from the Prime Agent daemon. */
export function parsePrimeAgentDaemonSessions(
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentSession[]> {
  return parseSessionListData(value);
}

/** Parse a raw Agent session returned by the Prime Agent daemon. */
export function parsePrimeAgentDaemonCreatedSession(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentSession> {
  return parseCreatedSessionData(value);
}

/** Parse a raw focused-session snapshot from the Prime Agent daemon. */
export function parsePrimeAgentDaemonSessionView(
  value: JsonValue,
  rlmDepthValue: JsonValue,
): PrimeAgentResult<PrimeAgentSessionView> {
  return parseSessionViewData(value, rlmDepthValue);
}

/** Parse durable sessions returned by the Prime Agent daemon. */
export function parsePrimeAgentDaemonSavedSessions(
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentSavedSession[]> {
  return parseSavedSessionListData(value);
}

/** Parse raw skill resources returned by the Prime Agent daemon. */
export function parsePrimeAgentDaemonSkillResources(
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentSkillResource[]> {
  return parseSkillResourceCatalogData(value);
}

/** Parse a raw model-catalog payload from the Prime Agent daemon. */
export function parsePrimeAgentDaemonModels(
  value: JsonValue,
): PrimeAgentResult<readonly PrimeAgentModel[]> {
  return parseModelCatalogData(value);
}

/** Parse a refinement request received at Ernie's daemon boundary. */
export function parsePrimeAgentDaemonRefinementRequest(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentRefinementRequest> {
  return parseRefinementRequest(value);
}
