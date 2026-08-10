import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, realpath, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Effect } from 'effect';

import {
  parsePrimeAgentGitBranchesResult,
  parsePrimeAgentGitWorktreeResult,
} from '../git-client';
import {
  parsePrimeAgentModelsResult,
  parsePrimeAgentRlmDepthResult,
  parsePrimeAgentWorkspaceResult,
} from '../client';
import {
  parsePrimeAgentDaemonModels,
  parsePrimeAgentDaemonSessions,
} from '../server';
import {
  createLocalGitWorktree,
  deleteLocalGitBranch,
  initializeLocalGitRepository,
  readLocalGitBranches,
  renameLocalGitBranch,
  switchLocalGitBranch,
} from '../git-server';

const execFileAsync = promisify(execFile);

function runGit(args: readonly string[]) {
  return Effect.tryPromise(() =>
    execFileAsync('git', [...args], { encoding: 'utf8' }),
  );
}

const createGitRepository = Effect.fn('Test.createGitRepository')(
  function* (cwd: string) {
    yield* runGit(['init', '--initial-branch', 'feature/local', cwd]);
    yield* runGit([
      '-C',
      cwd,
      '-c',
      'user.name=Ernie Test',
      '-c',
      'user.email=ernie@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'Initial commit',
    ]);
  },
);

function testInTempDirectory(
  name: string,
  prefix: string,
  use: (cwd: string) => Effect.Effect<void, unknown>,
): void {
  test(name, () =>
    Effect.runPromise(
      Effect.acquireUseRelease(
        Effect.tryPromise(() => mkdtemp(join(tmpdir(), prefix))),
        use,
        (cwd) =>
          Effect.tryPromise(() => rm(cwd, { force: true, recursive: true })).pipe(
            Effect.orDie,
          ),
      ),
    ),
  );
}

function testEffect(name: string, effect: Effect.Effect<void, unknown>): void {
  test(name, () => Effect.runPromise(effect));
}

test('keeps only connected top-level daemon sessions', () => {
  const result = parsePrimeAgentDaemonSessions({
    sessions: [
      {
        activeSessionId: 'root-active',
        attachedClients: 1,
        cwd: '/workspace/ernie',
        runtimeKind: 'top-level',
        firstMessage: 'Build the desktop',
        modified: '2026-08-10T10:00:00.000Z',
        model: {
          id: 'gpt-5.6-sol',
          name: 'GPT-5.6 Sol',
          provider: 'openai-codex',
        },
      },
      {
        activeSessionId: 'root-detached',
        attachedClients: 0,
        cwd: '/workspace/ernie',
        runtimeKind: 'top-level',
      },
      {
        activeSessionId: 'child-active',
        attachedClients: 1,
        cwd: '/workspace/ernie',
        runtimeKind: 'subagent',
      },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    value: [
      {
        activeSessionId: 'root-active',
        cwd: '/workspace/ernie',
        name: 'Build the desktop',
        model: {
          key: '["openai-codex","gpt-5.6-sol"]',
          id: 'gpt-5.6-sol',
          name: 'GPT-5.6 Sol',
          provider: 'openai-codex',
        },
        modifiedAt: '2026-08-10T10:00:00.000Z',
      },
    ],
  });
});

test('keeps models from configured daemon providers', () => {
  const result = parsePrimeAgentDaemonModels({
    configuredProviders: ['openai-codex'],
    models: [
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', provider: 'openai-codex' },
      { id: 'claude-opus', name: 'Claude Opus', provider: 'anthropic' },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    value: [
      {
        key: '["openai-codex","gpt-5.6-sol"]',
        id: 'gpt-5.6-sol',
        name: 'GPT-5.6 Sol',
        provider: 'openai-codex',
      },
    ],
  });
});

test('orders GPT models from the largest version first in the renderer', () => {
  const result = parsePrimeAgentModelsResult({
    ok: true,
    value: [
      {
        key: 'claude',
        id: 'claude-opus',
        name: 'Claude Opus',
        provider: 'anthropic',
      },
      {
        key: 'gpt-5.4',
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        provider: 'openai-codex',
      },
      {
        key: 'gpt-5.6',
        id: 'gpt-5.6',
        name: 'GPT-5.6 Sol',
        provider: 'openai-codex',
      },
    ],
  });

  assert.deepEqual(
    result.ok ? result.value.map((model) => model.name) : result,
    ['GPT-5.6 Sol', 'GPT-5.4', 'Claude Opus'],
  );
});

test('rejects malformed workspace data after IPC', () => {
  const result = parsePrimeAgentWorkspaceResult({
    ok: true,
    value: { currentCwd: '/workspace/ernie', sessions: [{}] },
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'protocol_error',
      message: 'Ernie received invalid daemon data.',
    },
  });
});

test('parses live RLM depth after IPC', () => {
  const result = parsePrimeAgentRlmDepthResult({
    ok: true,
    value: { maxDepth: 2, source: 'chat' },
  });

  assert.deepEqual(result, {
    ok: true,
    value: { maxDepth: 2, source: 'chat' },
  });
});

test('parses local Git branches after IPC', () => {
  const result = parsePrimeAgentGitBranchesResult({
    ok: true,
    value: {
      cwd: '/workspace/ernie',
      current: 'main',
      names: ['feature/local', 'staging', 'main'],
    },
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      cwd: '/workspace/ernie',
      current: 'main',
      names: ['main', 'staging', 'feature/local'],
    },
  });
});

test('rejects inconsistent local Git branches after IPC', () => {
  const result = parsePrimeAgentGitBranchesResult({
    ok: true,
    value: {
      cwd: '/workspace/ernie',
      current: 'main',
      names: ['feature/local'],
    },
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'protocol_error',
      message: 'Ernie received invalid daemon data.',
    },
  });
});

test('parses a created Git worktree after IPC', () => {
  const result = parsePrimeAgentGitWorktreeResult({
    ok: true,
    value: {
      cwd: '/workspace/ernie-worktrees/feature/calm-ui',
      branchName: 'feature/calm-ui',
    },
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      cwd: '/workspace/ernie-worktrees/feature/calm-ui',
      branchName: 'feature/calm-ui',
    },
  });
});

testInTempDirectory(
  'reads local branches through the Git process',
  'ernie-git-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* Effect.all(
        ['feature/second', 'main', 'staging'].map((name) =>
          runGit(['-C', cwd, 'branch', name]),
        ),
        { concurrency: 'unbounded', discard: true },
      );

      const result = yield* readLocalGitBranches(cwd);
      assert.deepEqual(result, {
        ok: true,
        value: {
          cwd,
          current: 'feature/local',
          names: ['feature/local', 'feature/second', 'main', 'staging'],
        },
      });
    }),
);

testInTempDirectory(
  'initializes a local Git repository with main',
  'ernie-git-init-',
  (cwd) =>
    Effect.gen(function* () {
      const firstResult = yield* initializeLocalGitRepository(cwd);
      const retryResult = yield* initializeLocalGitRepository(cwd);
      const expected = {
        ok: true,
        value: { cwd, current: 'main', names: ['main'] },
      };
      assert.deepEqual(firstResult, expected);
      assert.deepEqual(retryResult, expected);
    }),
);

testInTempDirectory(
  'switches to an existing local Git branch',
  'ernie-git-switch-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'branch', 'feature/second']);
      const result = yield* switchLocalGitBranch({
        cwd,
        name: 'feature/second',
      });
      assert.deepEqual(result, {
        ok: true,
        value: {
          cwd,
          current: 'feature/second',
          names: ['feature/local', 'feature/second'],
        },
      });
    }),
);

testInTempDirectory(
  'rejects a local Git branch that does not exist',
  'ernie-git-missing-branch-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      const result = yield* switchLocalGitBranch({ cwd, name: 'missing' });
      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'The selected local Git branch does not exist.',
        },
      });
    }),
);

testInTempDirectory(
  'deletes an existing merged local Git branch',
  'ernie-git-delete-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'branch', 'feature/merged']);
      const result = yield* deleteLocalGitBranch({
        cwd,
        name: 'feature/merged',
      });
      assert.deepEqual(result, {
        ok: true,
        value: { cwd, current: 'feature/local', names: ['feature/local'] },
      });
    }),
);

testInTempDirectory(
  'protects the main local Git branch from deletion',
  'ernie-git-protected-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'branch', 'main']);
      const result = yield* deleteLocalGitBranch({ cwd, name: 'main' });
      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'The selected local Git branch is protected.',
        },
      });
    }),
);

testInTempDirectory(
  'keeps an unmerged local Git branch',
  'ernie-git-unmerged-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'switch', '--create', 'feature/unmerged']);
      yield* runGit([
        '-C',
        cwd,
        '-c',
        'user.name=Ernie Test',
        '-c',
        'user.email=ernie@example.invalid',
        'commit',
        '--allow-empty',
        '-m',
        'Unmerged commit',
      ]);
      yield* runGit(['-C', cwd, 'switch', 'feature/local']);

      const result = yield* deleteLocalGitBranch({
        cwd,
        name: 'feature/unmerged',
      });
      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'request_failed',
          message: 'Git could not delete the local branch.',
        },
      });
      const branchResult = yield* runGit([
        '-C',
        cwd,
        'branch',
        '--list',
        'feature/unmerged',
      ]);
      assert.equal(branchResult.stdout.trim(), 'feature/unmerged');
    }),
);

testInTempDirectory(
  'renames the current local Git branch',
  'ernie-git-rename-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      const result = yield* renameLocalGitBranch({
        cwd,
        currentName: 'feature/local',
        newName: 'feature/renamed',
      });
      assert.deepEqual(result, {
        ok: true,
        value: {
          cwd,
          current: 'feature/renamed',
          names: ['feature/renamed'],
        },
      });
    }),
);

testInTempDirectory(
  'creates and reuses a branch-backed local Git worktree',
  'ernie-git-worktree-',
  (root) =>
    Effect.gen(function* () {
      const cwd = join(root, 'repository');
      yield* createGitRepository(cwd);

      const creation = { cwd, branchName: 'feature/calm-ui' };
      const firstResult = yield* createLocalGitWorktree(creation);
      const retryResult = yield* createLocalGitWorktree(creation);
      const canonicalRoot = yield* Effect.tryPromise(() => realpath(root));
      const worktreeCwd = join(
        canonicalRoot,
        'repository-worktrees',
        'feature',
        'calm-ui',
      );
      const expected = {
        ok: true,
        value: { cwd: worktreeCwd, branchName: 'feature/calm-ui' },
      };

      assert.deepEqual(firstResult, expected);
      assert.deepEqual(retryResult, expected);
      const branch = yield* runGit([
        '-C',
        worktreeCwd,
        'branch',
        '--show-current',
      ]);
      assert.equal(branch.stdout.trim(), 'feature/calm-ui');

      const nestedCreation = yield* createLocalGitWorktree({
        cwd: worktreeCwd,
        branchName: 'feature/second',
      });
      assert.deepEqual(nestedCreation, {
        ok: true,
        value: {
          cwd: join(canonicalRoot, 'repository-worktrees', 'feature', 'second'),
          branchName: 'feature/second',
        },
      });
    }),
);

testInTempDirectory(
  'replaces a prunable local Git worktree instead of returning its missing path',
  'ernie-git-worktree-prunable-',
  (root) =>
    Effect.gen(function* () {
      const cwd = join(root, 'repository');
      yield* createGitRepository(cwd);

      const creation = { cwd, branchName: 'feature/stale' };
      const firstResult = yield* createLocalGitWorktree(creation);
      assert.equal(firstResult.ok, true);
      if (!firstResult.ok) return;

      const movedCwd = join(root, 'moved-stale-worktree');
      yield* Effect.tryPromise(() => rename(firstResult.value.cwd, movedCwd));
      const replacementResult = yield* createLocalGitWorktree(creation);

      assert.deepEqual(replacementResult, firstResult);
      const branch = yield* runGit([
        '-C',
        firstResult.value.cwd,
        'branch',
        '--show-current',
      ]);
      assert.equal(branch.stdout.trim(), 'feature/stale');
    }),
);

testInTempDirectory(
  'rejects an invalid Git worktree branch name',
  'ernie-git-worktree-invalid-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      const result = yield* createLocalGitWorktree({
        cwd,
        branchName: 'feature..invalid',
      });

      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'Use a valid Git branch name for the new worktree.',
        },
      });
    }),
);

testInTempDirectory(
  'requires a first commit before creating a Git worktree',
  'ernie-git-worktree-unborn-',
  (cwd) =>
    Effect.gen(function* () {
      yield* initializeLocalGitRepository(cwd);
      const result = yield* createLocalGitWorktree({
        cwd,
        branchName: 'feature/first',
      });

      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'Create the first commit before adding a worktree.',
        },
      });
    }),
);

testInTempDirectory(
  'refuses to overwrite an existing local Git branch',
  'ernie-git-rename-conflict-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'branch', 'feature/existing']);
      const result = yield* renameLocalGitBranch({
        cwd,
        currentName: 'feature/local',
        newName: 'feature/existing',
      });
      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'The new local Git branch already exists.',
        },
      });
    }),
);

testInTempDirectory(
  'protects the main local Git branch from renaming',
  'ernie-git-rename-protected-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'branch', 'main']);
      const result = yield* renameLocalGitBranch({
        cwd,
        currentName: 'main',
        newName: 'renamed-main',
      });
      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'The selected local Git branch is protected.',
        },
      });
    }),
);

testInTempDirectory(
  'returns no branch for a directory outside a Git repository',
  'ernie-no-git-',
  (cwd) =>
    Effect.gen(function* () {
      const result = yield* readLocalGitBranches(cwd);
      assert.deepEqual(result, {
        ok: true,
        value: { cwd, current: null, names: [] },
      });
    }),
);

testEffect(
  'rejects a missing workspace path before starting Git',
  Effect.gen(function* () {
    const cwd = join(tmpdir(), 'ernie-missing-workspace');
    const result = yield* readLocalGitBranches(cwd);
    assert.deepEqual(result, {
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'The workspace path is invalid.',
      },
    });
  }),
);
