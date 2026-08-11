import { execFile } from 'node:child_process';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { Effect } from 'effect';

import type {
  PrimeAgentGitBranches,
  PrimeAgentGitWorkspace,
  PrimeAgentResult,
} from '../types';
import {
  parseGitBranchRename,
  parseGitBranchSelection,
  parseGitWorktreeCreation,
  parseWorkspaceCwd,
} from './protocol';

const execFileAsync = promisify(execFile);
const gitTimeoutMs = 3_000;
const gitWorktreeTimeoutMs = 30_000;
const gitDiagnosticLengthLimit = 2_000;

type GitOperation =
  | 'create_worktree'
  | 'delete_branch'
  | 'initialize_repository'
  | 'read_branches'
  | 'read_workspace'
  | 'rename_branch'
  | 'switch_branch';

interface GitWorktreeRecord {
  readonly cwd: string;
  readonly branchName: string | null;
  readonly prunable: boolean;
}

function tryExternal<A>(
  operation: () => PromiseLike<A>,
): Effect.Effect<A, unknown> {
  return Effect.tryPromise({ try: operation, catch: (error) => error });
}

function errorCode(error: unknown): string | number | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  return typeof error.code === 'string' || typeof error.code === 'number'
    ? error.code
    : null;
}

function diagnosticText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replaceAll(/[\u0000-\u001f\u007f]+/gu, ' ');
  return normalized.length === 0
    ? null
    : normalized.slice(0, gitDiagnosticLengthLimit);
}

function errorField(error: unknown, field: 'stderr'): unknown {
  return typeof error === 'object' && error !== null && field in error
    ? error[field]
    : null;
}

function reportGitFailure(operation: GitOperation, error: unknown): void {
  const stderr = diagnosticText(errorField(error, 'stderr'));
  console.error('Local Git request failed.', {
    operation,
    name: error instanceof Error ? error.name : 'NonError',
    code: errorCode(error),
    message:
      stderr === null
        ? diagnosticText(error instanceof Error ? error.message : null)
        : null,
    stderr,
  });
}

function parseGitWorktreeList(output: string): readonly GitWorktreeRecord[] {
  return output
    .trim()
    .split(/\r?\n\r?\n/u)
    .map((block) => {
      let cwd: string | null = null;
      let branchName: string | null = null;
      let prunable = false;

      for (const line of block.split(/\r?\n/u)) {
        if (line.startsWith('worktree ')) cwd = line.slice('worktree '.length);
        if (line.startsWith('branch refs/heads/')) {
          branchName = line.slice('branch refs/heads/'.length);
        }
        if (line === 'prunable' || line.startsWith('prunable ')) prunable = true;
      }

      return cwd === null ? null : { cwd, branchName, prunable };
    })
    .filter((record): record is GitWorktreeRecord => record !== null);
}

function worktreeDestination(
  repositoryRoot: string,
  branchName: string,
): string {
  return join(
    dirname(repositoryRoot),
    `${basename(repositoryRoot)}-worktrees`,
    ...branchName.split('/'),
  );
}

function parseWorkspaceDirectory(
  cwd: unknown,
): Effect.Effect<PrimeAgentResult<string>> {
  const parsedCwd = parseWorkspaceCwd(cwd);
  if (!parsedCwd.ok) return Effect.succeed(parsedCwd);

  return tryExternal(() => stat(parsedCwd.value)).pipe(
    Effect.match({
      onFailure: () => ({
        ok: false as const,
        error: {
          code: 'invalid_request' as const,
          message: 'The workspace path is invalid.',
        },
      }),
      onSuccess: (workspace) =>
        workspace.isDirectory()
          ? parsedCwd
          : {
              ok: false as const,
              error: {
                code: 'invalid_request' as const,
                message: 'The workspace path is invalid.',
              },
            },
    }),
  );
}

/** Resolve a workspace to its stable Git repository and branch identity. */
export const readLocalGitWorkspace = Effect.fn('Git.readLocalGitWorkspace')(
  function* (cwd: unknown) {
    const parsedCwd = yield* parseWorkspaceDirectory(cwd);
    if (!parsedCwd.ok) return parsedCwd;

    const canonicalResult = yield* tryExternal(() =>
      realpath(parsedCwd.value),
    ).pipe(
      Effect.match({
        onFailure: (error): PrimeAgentResult<string> => {
          reportGitFailure('read_workspace', error);
          return {
            ok: false,
            error: {
              code: 'request_failed',
              message: 'Ernie could not identify the local Git workspace.',
            },
          };
        },
        onSuccess: (canonicalCwd): PrimeAgentResult<string> => ({
          ok: true,
          value: canonicalCwd,
        }),
      }),
    );
    if (!canonicalResult.ok) return canonicalResult;
    const canonicalCwd = canonicalResult.value;

    return yield* tryExternal(() =>
      execFileAsync(
        'git',
        ['-C', canonicalCwd, 'worktree', 'list', '--porcelain'],
        { encoding: 'utf8', timeout: gitTimeoutMs },
      ),
    ).pipe(
      Effect.match({
        onFailure: (error): PrimeAgentResult<PrimeAgentGitWorkspace> => {
          if (errorCode(error) === 128) {
            return {
              ok: true,
              value: {
                branchName: null,
                cwd: canonicalCwd,
                repositoryCwd: canonicalCwd,
              },
            };
          }
          reportGitFailure('read_workspace', error);
          return {
            ok: false,
            error: {
              code: 'request_failed',
              message: 'Ernie could not identify the local Git workspace.',
            },
          };
        },
        onSuccess: ({ stdout }): PrimeAgentResult<PrimeAgentGitWorkspace> => {
          const worktrees = parseGitWorktreeList(stdout);
          const repositoryCwd = worktrees[0]?.cwd ?? canonicalCwd;
          const workspace = worktrees.find(
            (record) => record.cwd === canonicalCwd,
          );
          return {
            ok: true,
            value: {
              branchName: workspace?.branchName ?? null,
              cwd: canonicalCwd,
              repositoryCwd,
            },
          };
        },
      }),
    );
  },
);

/** Read local branches without changing the repository. */
export const readLocalGitBranches = Effect.fn('Git.readLocalGitBranches')(
  function* (cwd: unknown) {
    const parsedCwd = yield* parseWorkspaceDirectory(cwd);
    if (!parsedCwd.ok) return parsedCwd;

    return yield* Effect.gen(function* () {
      const currentResult = yield* tryExternal(() =>
        execFileAsync('git', ['-C', parsedCwd.value, 'branch', '--show-current'], {
          encoding: 'utf8',
          timeout: gitTimeoutMs,
        }),
      );
      const namesResult = yield* tryExternal(() =>
        execFileAsync(
          'git',
          [
            '-C',
            parsedCwd.value,
            'for-each-ref',
            '--format=%(refname:short)',
            'refs/heads',
          ],
          { encoding: 'utf8', timeout: gitTimeoutMs },
        ),
      );
      const current = currentResult.stdout.trim() || null;
      const names = namesResult.stdout
        .split(/\r?\n/u)
        .map((name) => name.trim())
        .filter((name) => name.length > 0);

      if (current !== null && !names.includes(current)) names.push(current);
      names.sort((left, right) => left.localeCompare(right));

      return {
        ok: true as const,
        value: { cwd: parsedCwd.value, current, names },
      };
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          if (errorCode(error) === 128) {
            return {
              ok: true as const,
              value: { cwd: parsedCwd.value, current: null, names: [] },
            };
          }

          reportGitFailure('read_branches', error);
          return {
            ok: false as const,
            error: {
              code: 'request_failed' as const,
              message: 'Ernie could not read the local Git branches.',
            },
          };
        }),
      ),
    );
  },
);

/** Initialize one workspace as a local Git repository with main as its first branch. */
export const initializeLocalGitRepository = Effect.fn(
  'Git.initializeLocalGitRepository',
)(function* (cwd: unknown) {
  const parsedCwd = yield* parseWorkspaceDirectory(cwd);
  if (!parsedCwd.ok) return parsedCwd;

  const branches = yield* readLocalGitBranches(parsedCwd.value);
  if (!branches.ok) return branches;
  if (branches.value.current !== null || branches.value.names.length > 0) {
    return branches;
  }

  return yield* tryExternal(() =>
    execFileAsync(
      'git',
      ['-C', parsedCwd.value, 'init', '--initial-branch=main'],
      { encoding: 'utf8', timeout: gitTimeoutMs },
    ),
  ).pipe(
    Effect.flatMap(() => readLocalGitBranches(parsedCwd.value)),
    Effect.catchAll((error) =>
      Effect.sync(() => {
        reportGitFailure('initialize_repository', error);
        return {
          ok: false as const,
          error: {
            code: 'request_failed' as const,
            message: 'Git could not initialize the local repository.',
          },
        };
      }),
    ),
  );
});

/** Switch one workspace to an existing local Git branch. */
export const switchLocalGitBranch = Effect.fn('Git.switchLocalGitBranch')(
  function* (selection: unknown) {
    const parsedSelection = parseGitBranchSelection(selection);
    if (!parsedSelection.ok) return parsedSelection;

    const branches = yield* readLocalGitBranches(parsedSelection.value.cwd);
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

    return yield* tryExternal(() =>
      execFileAsync(
        'git',
        [
          '-C',
          parsedSelection.value.cwd,
          'switch',
          '--no-guess',
          parsedSelection.value.name,
        ],
        { encoding: 'utf8', timeout: gitTimeoutMs },
      ),
    ).pipe(
      Effect.flatMap(() => readLocalGitBranches(parsedSelection.value.cwd)),
      Effect.catchAll((error) =>
        Effect.sync(() => {
          reportGitFailure('switch_branch', error);
          return {
            ok: false as const,
            error: {
              code: 'request_failed' as const,
              message: 'Git could not switch the local branch.',
            },
          };
        }),
      ),
    );
  },
);

/** Delete one merged local branch while protecting primary and current branches. */
export const deleteLocalGitBranch = Effect.fn('Git.deleteLocalGitBranch')(
  function* (selection: unknown) {
    const parsedSelection = parseGitBranchSelection(selection);
    if (!parsedSelection.ok) return parsedSelection;

    const branches = yield* readLocalGitBranches(parsedSelection.value.cwd);
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

    return yield* tryExternal(() =>
      execFileAsync(
        'git',
        [
          '-C',
          parsedSelection.value.cwd,
          'branch',
          '--delete',
          parsedSelection.value.name,
        ],
        { encoding: 'utf8', timeout: gitTimeoutMs },
      ),
    ).pipe(
      Effect.flatMap(() => readLocalGitBranches(parsedSelection.value.cwd)),
      Effect.catchAll((error) =>
        Effect.sync(() => {
          reportGitFailure('delete_branch', error);
          return {
            ok: false as const,
            error: {
              code: 'request_failed' as const,
              message: 'Git could not delete the local branch.',
            },
          };
        }),
      ),
    );
  },
);

/** Rename one local branch without overwriting another branch. */
export const renameLocalGitBranch = Effect.fn('Git.renameLocalGitBranch')(
  function* (rename: unknown) {
    const parsedRename = parseGitBranchRename(rename);
    if (!parsedRename.ok) return parsedRename;

    const branches = yield* readLocalGitBranches(parsedRename.value.cwd);
    if (!branches.ok) return branches;
    if (
      parsedRename.value.currentName === 'main' ||
      parsedRename.value.currentName === 'staging'
    ) {
      return {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'The selected local Git branch is protected.',
        },
      };
    }
    if (parsedRename.value.currentName === parsedRename.value.newName) {
      return branches;
    }

    const hasCurrentName = branches.value.names.includes(
      parsedRename.value.currentName,
    );
    const hasNewName = branches.value.names.includes(parsedRename.value.newName);
    if (!hasCurrentName && hasNewName) return branches;
    if (!hasCurrentName) {
      return {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'The selected local Git branch does not exist.',
        },
      };
    }
    if (hasNewName) {
      return {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'The new local Git branch already exists.',
        },
      };
    }

    return yield* tryExternal(() =>
      execFileAsync(
        'git',
        [
          '-C',
          parsedRename.value.cwd,
          'branch',
          '--move',
          parsedRename.value.currentName,
          parsedRename.value.newName,
        ],
        { encoding: 'utf8', timeout: gitTimeoutMs },
      ),
    ).pipe(
      Effect.flatMap(() => readLocalGitBranches(parsedRename.value.cwd)),
      Effect.catchAll((error) =>
        Effect.sync(() => {
          reportGitFailure('rename_branch', error);
          return {
            ok: false as const,
            error: {
              code: 'request_failed' as const,
              message: 'Git could not rename the local branch.',
            },
          };
        }),
      ),
    );
  },
);

/** Create or reuse a sibling Git worktree for one local branch. */
export const createLocalGitWorktree = Effect.fn('Git.createLocalGitWorktree')(
  function* (creation: unknown) {
    const parsedCreation = parseGitWorktreeCreation(creation);
    if (!parsedCreation.ok) return parsedCreation;

    const parsedCwd = yield* parseWorkspaceDirectory(parsedCreation.value.cwd);
    if (!parsedCwd.ok) return parsedCwd;

    const branchName = parsedCreation.value.branchName;
    const branchIsValid = yield* tryExternal(() =>
      execFileAsync(
        'git',
        ['-C', parsedCwd.value, 'check-ref-format', '--branch', branchName],
        { encoding: 'utf8', timeout: gitTimeoutMs },
      ),
    ).pipe(
      Effect.match({
        onFailure: () => false,
        onSuccess: () => true,
      }),
    );
    if (!branchIsValid) {
      return {
        ok: false as const,
        error: {
          code: 'invalid_request' as const,
          message: 'Use a valid Git branch name for the new worktree.',
        },
      };
    }

    return yield* Effect.gen(function* () {
      const worktreeListResult = yield* tryExternal(() =>
        execFileAsync(
          'git',
          ['-C', parsedCwd.value, 'worktree', 'list', '--porcelain'],
          { encoding: 'utf8', timeout: gitTimeoutMs },
        ),
      );
      const worktrees = parseGitWorktreeList(worktreeListResult.stdout);
      const repositoryRoot = worktrees[0]?.cwd;
      if (repositoryRoot === undefined) {
        return {
          ok: false as const,
          error: {
            code: 'request_failed' as const,
            message: 'Git could not find the primary worktree.',
          },
        };
      }

      const existingWorktree = worktrees.find(
        (worktree) => worktree.branchName === branchName,
      );
      if (existingWorktree !== undefined && !existingWorktree.prunable) {
        return {
          ok: true as const,
          value: { cwd: existingWorktree.cwd, branchName },
        };
      }
      if (existingWorktree?.prunable === true) {
        yield* tryExternal(() =>
          execFileAsync(
            'git',
            [
              '-C',
              repositoryRoot,
              'worktree',
              'remove',
              '--force',
              existingWorktree.cwd,
            ],
            { encoding: 'utf8', timeout: gitTimeoutMs },
          ),
        );
      }

      const [branches, hasCommit] = yield* Effect.all(
        [
          readLocalGitBranches(repositoryRoot),
          tryExternal(() =>
            execFileAsync(
              'git',
              ['-C', repositoryRoot, 'rev-parse', '--verify', 'HEAD'],
              { encoding: 'utf8', timeout: gitTimeoutMs },
            ),
          ).pipe(
            Effect.match({
              onFailure: () => false,
              onSuccess: () => true,
            }),
          ),
        ],
        { concurrency: 'unbounded' },
      );
      if (!branches.ok) return branches;
      if (!hasCommit) {
        return {
          ok: false as const,
          error: {
            code: 'invalid_request' as const,
            message: 'Create the first commit before adding a worktree.',
          },
        };
      }

      const destination = worktreeDestination(repositoryRoot, branchName);
      yield* tryExternal(() => mkdir(dirname(destination), { recursive: true }));
      const worktreeArguments = branches.value.names.includes(branchName)
        ? ['-C', repositoryRoot, 'worktree', 'add', destination, branchName]
        : [
            '-C',
            repositoryRoot,
            'worktree',
            'add',
            '--no-track',
            '-b',
            branchName,
            destination,
            'HEAD',
          ];
      yield* tryExternal(() =>
        execFileAsync('git', worktreeArguments, {
          encoding: 'utf8',
          timeout: gitWorktreeTimeoutMs,
        }),
      );

      return {
        ok: true as const,
        value: { cwd: destination, branchName },
      };
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          reportGitFailure('create_worktree', error);
          return {
            ok: false as const,
            error: {
              code: 'request_failed' as const,
              message: 'Git could not create the new worktree.',
            },
          };
        }),
      ),
    );
  },
);
