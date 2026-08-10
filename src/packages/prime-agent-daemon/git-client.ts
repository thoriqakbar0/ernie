import { parseGitBranchesResult } from './lib/protocol';

import type {
  PrimeAgentGitBranches,
  PrimeAgentResult,
} from './types';

export type { PrimeAgentGitBranches };

const preferredGitBranches = new Map([
  ['main', 0],
  ['staging', 1],
]);

function compareGitBranches(left: string, right: string): number {
  const leftPriority = preferredGitBranches.get(left) ?? 2;
  const rightPriority = preferredGitBranches.get(right) ?? 2;
  return leftPriority - rightPriority || left.localeCompare(right);
}

/** Parse local Git branches received from Electron's main process. */
export function parsePrimeAgentGitBranchesResult(
  value: unknown,
): PrimeAgentResult<PrimeAgentGitBranches> {
  const result = parseGitBranchesResult(value);
  return result.ok
    ? {
        ok: true,
        value: {
          ...result.value,
          names: [...result.value.names].sort(compareGitBranches),
        },
      }
    : result;
}
