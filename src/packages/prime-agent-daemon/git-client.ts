import {
  parseGitBranchesResult,
  parseGitWorkspaceResult,
  parseGitWorktreeResult,
} from './lib/protocol';
import type { JsonValue } from '../json-value';

import type {
  PrimeAgentGitBranches,
  PrimeAgentGitWorkspace,
  PrimeAgentGitWorktree,
  PrimeAgentResult,
} from './types';

export type {
  PrimeAgentGitBranches,
  PrimeAgentGitWorkspace,
  PrimeAgentGitWorktree,
};

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
  value: JsonValue,
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

/** Parse a local Git worktree received from Electron's main process. */
export function parsePrimeAgentGitWorktreeResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentGitWorktree> {
  return parseGitWorktreeResult(value);
}

/** Parse Git repository identity received from Electron's main process. */
export function parsePrimeAgentGitWorkspaceResult(
  value: JsonValue,
): PrimeAgentResult<PrimeAgentGitWorkspace> {
  return parseGitWorkspaceResult(value);
}
