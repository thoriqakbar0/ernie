export { createPrimeAgentDaemon } from './lib/daemon';
import {
  parseCreatedSessionData,
  parseModelCatalogData,
  parseRefinementRequest,
  parseSavedSessionListData,
  parseSessionListData,
  parseSessionViewData,
  parseSkillCatalogData,
} from './lib/protocol';

import type {
  PrimeAgentDaemon,
  PrimeAgentModel,
  PrimeAgentResult,
  PrimeAgentRefinementRequest,
  PrimeAgentSavedSession,
  PrimeAgentSession,
  PrimeAgentSessionView,
  PrimeAgentSkill,
} from './types';

export type { PrimeAgentDaemon };

/** Parse a raw session-list payload from the Prime Agent daemon. */
export function parsePrimeAgentDaemonSessions(
  value: unknown,
): PrimeAgentResult<readonly PrimeAgentSession[]> {
  return parseSessionListData(value);
}

/** Parse a raw Agent session returned by the Prime Agent daemon. */
export function parsePrimeAgentDaemonCreatedSession(
  value: unknown,
): PrimeAgentResult<PrimeAgentSession> {
  return parseCreatedSessionData(value);
}

/** Parse a raw focused-session snapshot from the Prime Agent daemon. */
export function parsePrimeAgentDaemonSessionView(
  value: unknown,
  rlmDepthValue: unknown,
): PrimeAgentResult<PrimeAgentSessionView> {
  return parseSessionViewData(value, rlmDepthValue);
}

/** Parse durable sessions returned by the Prime Agent daemon. */
export function parsePrimeAgentDaemonSavedSessions(
  value: unknown,
): PrimeAgentResult<readonly PrimeAgentSavedSession[]> {
  return parseSavedSessionListData(value);
}

/** Parse raw skill commands returned by the Prime Agent daemon. */
export function parsePrimeAgentDaemonSkills(
  value: unknown,
): PrimeAgentResult<readonly PrimeAgentSkill[]> {
  return parseSkillCatalogData(value);
}

/** Parse a raw model-catalog payload from the Prime Agent daemon. */
export function parsePrimeAgentDaemonModels(
  value: unknown,
): PrimeAgentResult<readonly PrimeAgentModel[]> {
  return parseModelCatalogData(value);
}

/** Parse a refinement request received at Ernie's daemon boundary. */
export function parsePrimeAgentDaemonRefinementRequest(
  value: unknown,
): PrimeAgentResult<PrimeAgentRefinementRequest> {
  return parseRefinementRequest(value);
}
