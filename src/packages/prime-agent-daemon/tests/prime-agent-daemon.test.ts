import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import {
  parsePrimeAgentGitBranchesResult,
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
  deleteLocalGitBranch,
  readLocalGitBranches,
  renameLocalGitBranch,
  switchLocalGitBranch,
} from '../git-server';

const execFileAsync = promisify(execFile);

async function createGitRepository(cwd: string): Promise<void> {
  await execFileAsync(
    'git',
    ['init', '--initial-branch', 'feature/local', cwd],
    { encoding: 'utf8' },
  );
  await execFileAsync(
    'git',
    [
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
    ],
    { encoding: 'utf8' },
  );
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

test('reads local branches through the Git process', async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), 'ernie-git-'));
  context.after(() => rm(cwd, { force: true, recursive: true }));
  await createGitRepository(cwd);
  await Promise.all(
    ['feature/second', 'main', 'staging'].map((name) =>
      execFileAsync('git', ['-C', cwd, 'branch', name], {
        encoding: 'utf8',
      }),
    ),
  );

  const result = await readLocalGitBranches(cwd);

  assert.deepEqual(result, {
    ok: true,
    value: {
      cwd,
      current: 'feature/local',
      names: ['feature/local', 'feature/second', 'main', 'staging'],
    },
  });
});

test('switches to an existing local Git branch', async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), 'ernie-git-switch-'));
  context.after(() => rm(cwd, { force: true, recursive: true }));
  await createGitRepository(cwd);
  await execFileAsync('git', ['-C', cwd, 'branch', 'feature/second'], {
    encoding: 'utf8',
  });

  const result = await switchLocalGitBranch({
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
});

test('rejects a local Git branch that does not exist', async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), 'ernie-git-missing-branch-'));
  context.after(() => rm(cwd, { force: true, recursive: true }));
  await createGitRepository(cwd);

  const result = await switchLocalGitBranch({ cwd, name: 'missing' });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'invalid_request',
      message: 'The selected local Git branch does not exist.',
    },
  });
});

test('deletes an existing merged local Git branch', async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), 'ernie-git-delete-'));
  context.after(() => rm(cwd, { force: true, recursive: true }));
  await createGitRepository(cwd);
  await execFileAsync('git', ['-C', cwd, 'branch', 'feature/merged'], {
    encoding: 'utf8',
  });

  const result = await deleteLocalGitBranch({
    cwd,
    name: 'feature/merged',
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      cwd,
      current: 'feature/local',
      names: ['feature/local'],
    },
  });
});

test('protects the main local Git branch from deletion', async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), 'ernie-git-protected-'));
  context.after(() => rm(cwd, { force: true, recursive: true }));
  await createGitRepository(cwd);
  await execFileAsync('git', ['-C', cwd, 'branch', 'main'], {
    encoding: 'utf8',
  });

  const result = await deleteLocalGitBranch({ cwd, name: 'main' });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'invalid_request',
      message: 'The selected local Git branch is protected.',
    },
  });
});

test('keeps an unmerged local Git branch', async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), 'ernie-git-unmerged-'));
  context.after(() => rm(cwd, { force: true, recursive: true }));
  await createGitRepository(cwd);
  await execFileAsync(
    'git',
    ['-C', cwd, 'switch', '--create', 'feature/unmerged'],
    { encoding: 'utf8' },
  );
  await execFileAsync(
    'git',
    [
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
    ],
    { encoding: 'utf8' },
  );
  await execFileAsync('git', ['-C', cwd, 'switch', 'feature/local'], {
    encoding: 'utf8',
  });

  const result = await deleteLocalGitBranch({
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
  const branchResult = await execFileAsync(
    'git',
    ['-C', cwd, 'branch', '--list', 'feature/unmerged'],
    { encoding: 'utf8' },
  );
  assert.equal(branchResult.stdout.trim(), 'feature/unmerged');
});

test('renames the current local Git branch', async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), 'ernie-git-rename-'));
  context.after(() => rm(cwd, { force: true, recursive: true }));
  await createGitRepository(cwd);

  const result = await renameLocalGitBranch({
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
});

test('refuses to overwrite an existing local Git branch', async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), 'ernie-git-rename-conflict-'));
  context.after(() => rm(cwd, { force: true, recursive: true }));
  await createGitRepository(cwd);
  await execFileAsync('git', ['-C', cwd, 'branch', 'feature/existing'], {
    encoding: 'utf8',
  });

  const result = await renameLocalGitBranch({
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
});

test('protects the main local Git branch from renaming', async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), 'ernie-git-rename-protected-'));
  context.after(() => rm(cwd, { force: true, recursive: true }));
  await createGitRepository(cwd);
  await execFileAsync('git', ['-C', cwd, 'branch', 'main'], {
    encoding: 'utf8',
  });

  const result = await renameLocalGitBranch({
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
});

test('returns no branch for a directory outside a Git repository', async (context) => {
  const cwd = await mkdtemp(join(tmpdir(), 'ernie-no-git-'));
  context.after(() => rm(cwd, { force: true, recursive: true }));

  const result = await readLocalGitBranches(cwd);

  assert.deepEqual(result, {
    ok: true,
    value: { cwd, current: null, names: [] },
  });
});

test('rejects a missing workspace path before starting Git', async () => {
  const cwd = join(tmpdir(), 'ernie-missing-workspace');

  const result = await readLocalGitBranches(cwd);

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'invalid_request',
      message: 'The workspace path is invalid.',
    },
  });
});
