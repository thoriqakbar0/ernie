import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';

import type {
  PrimeAgentGitBranches,
  PrimeAgentResult,
} from '../types';
import { parseGitBranchSelection, parseWorkspaceCwd } from './protocol';

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

async function parseWorkspaceDirectory(
  cwd: unknown,
): Promise<PrimeAgentResult<string>> {
  const parsedCwd = parseWorkspaceCwd(cwd);
  if (!parsedCwd.ok) return parsedCwd;

  try {
    const workspace = await stat(parsedCwd.value);
    if (workspace.isDirectory()) return parsedCwd;
  } catch {
    // The common failure result below owns the safe boundary message.
  }

  return {
    ok: false,
    error: {
      code: 'invalid_request',
      message: 'The workspace path is invalid.',
    },
  };
}

/** Read local branches without changing the repository. */
export async function readLocalGitBranches(
  cwd: unknown,
): Promise<PrimeAgentResult<PrimeAgentGitBranches>> {
  const parsedCwd = await parseWorkspaceDirectory(cwd);
  if (!parsedCwd.ok) return parsedCwd;

  try {
    const currentResult = await execFileAsync(
      'git',
      ['-C', parsedCwd.value, 'branch', '--show-current'],
      {
        encoding: 'utf8',
        timeout: gitTimeoutMs,
      },
    );
    const namesResult = await execFileAsync(
      'git',
      [
        '-C',
        parsedCwd.value,
        'for-each-ref',
        '--format=%(refname:short)',
        'refs/heads',
      ],
      { encoding: 'utf8', timeout: gitTimeoutMs },
    );
    const current = currentResult.stdout.trim() || null;
    const names = namesResult.stdout
      .split(/\r?\n/u)
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    if (current !== null && !names.includes(current)) names.push(current);
    names.sort((left, right) => left.localeCompare(right));

    return {
      ok: true,
      value: { cwd: parsedCwd.value, current, names },
    };
  } catch (error) {
    if (errorCode(error) === 128) {
      return {
        ok: true,
        value: { cwd: parsedCwd.value, current: null, names: [] },
      };
    }

    reportGitFailure(error);
    return {
      ok: false,
      error: {
        code: 'request_failed',
        message: 'Ernie could not read the local Git branches.',
      },
    };
  }
}

/** Switch one workspace to an existing local Git branch. */
export async function switchLocalGitBranch(
  selection: unknown,
): Promise<PrimeAgentResult<PrimeAgentGitBranches>> {
  const parsedSelection = parseGitBranchSelection(selection);
  if (!parsedSelection.ok) return parsedSelection;

  const branches = await readLocalGitBranches(parsedSelection.value.cwd);
  if (!branches.ok) return branches;
  if (!branches.value.names.includes(parsedSelection.value.name)) {
    return {
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'The selected local Git branch does not exist.',
      },
    };
  }
  if (branches.value.current === parsedSelection.value.name) return branches;

  try {
    await execFileAsync(
      'git',
      [
        '-C',
        parsedSelection.value.cwd,
        'switch',
        '--no-guess',
        parsedSelection.value.name,
      ],
      { encoding: 'utf8', timeout: gitTimeoutMs },
    );
    return readLocalGitBranches(parsedSelection.value.cwd);
  } catch (error) {
    reportGitFailure(error);
    return {
      ok: false,
      error: {
        code: 'request_failed',
        message: 'Git could not switch the local branch.',
      },
    };
  }
}

/** Delete one merged local branch while protecting primary and current branches. */
export async function deleteLocalGitBranch(
  selection: unknown,
): Promise<PrimeAgentResult<PrimeAgentGitBranches>> {
  const parsedSelection = parseGitBranchSelection(selection);
  if (!parsedSelection.ok) return parsedSelection;

  const branches = await readLocalGitBranches(parsedSelection.value.cwd);
  if (!branches.ok) return branches;
  if (
    parsedSelection.value.name === 'main' ||
    parsedSelection.value.name === 'staging' ||
    parsedSelection.value.name === branches.value.current
  ) {
    return {
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'The selected local Git branch is protected.',
      },
    };
  }
  if (!branches.value.names.includes(parsedSelection.value.name)) {
    return {
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'The selected local Git branch does not exist.',
      },
    };
  }

  try {
    await execFileAsync(
      'git',
      [
        '-C',
        parsedSelection.value.cwd,
        'branch',
        '--delete',
        parsedSelection.value.name,
      ],
      { encoding: 'utf8', timeout: gitTimeoutMs },
    );
    return readLocalGitBranches(parsedSelection.value.cwd);
  } catch (error) {
    reportGitFailure(error);
    return {
      ok: false,
      error: {
        code: 'request_failed',
        message: 'Git could not delete the local branch.',
      },
    };
  }
}
