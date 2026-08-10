import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';

import type {
  PrimeAgentGitBranch,
  PrimeAgentResult,
} from '../types';
import { parseWorkspaceCwd } from './protocol';

const execFileAsync = promisify(execFile);
const gitTimeoutMs = 3_000;

function errorCode(error: unknown): string | number | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  return typeof error.code === 'string' || typeof error.code === 'number'
    ? error.code
    : null;
}

function reportGitFailure(error: unknown): void {
  console.error('Local Git branch request failed.', {
    name: error instanceof Error ? error.name : 'NonError',
    code: errorCode(error),
  });
}

/** Read the checked-out branch without changing the repository. */
export async function readLocalGitBranch(
  cwd: unknown,
): Promise<PrimeAgentResult<PrimeAgentGitBranch>> {
  const parsedCwd = parseWorkspaceCwd(cwd);
  if (!parsedCwd.ok) return parsedCwd;

  try {
    const workspace = await stat(parsedCwd.value);
    if (!workspace.isDirectory()) {
      return {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'The workspace path is invalid.',
        },
      };
    }
  } catch {
    return {
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'The workspace path is invalid.',
      },
    };
  }

  try {
    const result = await execFileAsync(
      'git',
      ['-C', parsedCwd.value, 'branch', '--show-current'],
      { encoding: 'utf8', timeout: gitTimeoutMs },
    );
    const name = result.stdout.trim();
    return {
      ok: true,
      value: { cwd: parsedCwd.value, name: name.length > 0 ? name : null },
    };
  } catch (error) {
    if (errorCode(error) === 128) {
      return {
        ok: true,
        value: { cwd: parsedCwd.value, name: null },
      };
    }

    reportGitFailure(error);
    return {
      ok: false,
      error: {
        code: 'request_failed',
        message: 'Ernie could not read the local Git branch.',
      },
    };
  }
}
