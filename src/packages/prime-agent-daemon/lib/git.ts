import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  PrimeAgentGitBranch,
  PrimeAgentResult,
} from '../types';
import { parseWorkspaceCwd } from './protocol';

const execFileAsync = promisify(execFile);
const gitTimeoutMs = 3_000;

/** Read the checked-out branch without changing the repository. */
export async function readLocalGitBranch(
  cwd: unknown,
): Promise<PrimeAgentResult<PrimeAgentGitBranch>> {
  const parsedCwd = parseWorkspaceCwd(cwd);
  if (!parsedCwd.ok) return parsedCwd;

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
  } catch {
    return {
      ok: true,
      value: { cwd: parsedCwd.value, name: null },
    };
  }
}
