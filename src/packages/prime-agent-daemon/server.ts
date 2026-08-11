export { createPrimeAgentDaemon } from './lib/daemon';
import {
  parseCreatedSessionData,
  parseModelCatalogData,
  parseSavedSessionListData,
  parseSessionListData,
  parseSkillCatalogData,
} from './lib/protocol';

import type {
  PrimeAgentDaemon,
  PrimeAgentModel,
  PrimeAgentResult,
  PrimeAgentSavedSession,
  PrimeAgentSession,
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
