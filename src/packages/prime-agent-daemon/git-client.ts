import { parseGitBranchResult } from './lib/protocol';

import type {
  PrimeAgentGitBranch,
  PrimeAgentResult,
} from './types';

export type { PrimeAgentGitBranch };

/** Parse a local Git branch response received from Electron's main process. */
export function parsePrimeAgentGitBranchResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentGitBranch> {
  return parseGitBranchResult(value);
}
