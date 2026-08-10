export { createPrimeAgentDaemon } from './lib/daemon';
import {
  parseModelCatalogData,
  parseSessionListData,
} from './lib/protocol';

import type {
  PrimeAgentDaemon,
  PrimeAgentModel,
  PrimeAgentResult,
  PrimeAgentSession,
} from './types';

export type { PrimeAgentDaemon };

/** Parse a raw session-list payload from the Prime Agent daemon. */
export function parsePrimeAgentDaemonSessions(
  value: unknown,
): PrimeAgentResult<readonly PrimeAgentSession[]> {
  return parseSessionListData(value);
}

/** Parse a raw model-catalog payload from the Prime Agent daemon. */
export function parsePrimeAgentDaemonModels(
  value: unknown,
): PrimeAgentResult<readonly PrimeAgentModel[]> {
  return parseModelCatalogData(value);
}
