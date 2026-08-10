import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Effect } from 'effect';

import type {
  PrimeAgentGitBranches,
  PrimeAgentResult,
} from '../types';
import {
  parseGitBranchRename,
  parseGitBranchSelection,
  parseWorkspaceCwd,
} from './protocol';

const execFileAsync = promisify(execFile);
const gitTimeoutMs = 3_000;

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

function reportGitFailure(error: unknown): void {
  console.error('Local Git branch request failed.', {
    name: error instanceof Error ? error.name : 'NonError',
    code: errorCode(error),
  });
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

          reportGitFailure(error);
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
        reportGitFailure(error);
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
          reportGitFailure(error);
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
          reportGitFailure(error);
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
          reportGitFailure(error);
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
