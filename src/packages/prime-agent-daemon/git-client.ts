import { parseGitBranchesResult } from './lib/protocol';

import type {
  PrimeAgentGitBranches,
  PrimeAgentResult,
} from './types';

export type { PrimeAgentGitBranches };

/** Parse local Git branches received from Electron's main process. */
export function parsePrimeAgentGitBranchesResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentGitBranches> {
  return parseGitBranchesResult(value);
}
