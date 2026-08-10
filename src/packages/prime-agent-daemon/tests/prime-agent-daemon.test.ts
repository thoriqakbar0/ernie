import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  parsePrimeAgentGitBranchResult,
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

test('parses a local Git branch after IPC', () => {
  const result = parsePrimeAgentGitBranchResult({
    ok: true,
    value: { cwd: '/workspace/ernie', name: 'main' },
  });

  assert.deepEqual(result, {
    ok: true,
    value: { cwd: '/workspace/ernie', name: 'main' },
  });
});
