import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  connectAgentWorkspaceSession,
  createAgentWithTask,
  projectAgentWorkspaceControls,
  projectAgentWorkspaceFolders,
  selectInitialAgentWorkspace,
  type AgentCreationPort,
} from '../index';

const model = {
  id: 'gpt-5.6',
  key: '["openai","gpt-5.6"]',
  name: 'GPT-5.6',
  provider: 'openai',
  thinkingLevels: ['low', 'medium', 'high'],
} as const;

const session = {
  activeSessionId: 'agent-one',
  activity: 'idle',
  cwd: '/work/ernie',
  model: null,
  modifiedAt: '2026-08-16T05:00:00.000Z',
  name: 'New Agent',
  sessionPath: '/sessions/one.jsonl',
} as const;

const configuration = {
  availableThinkingLevels: ['low', 'medium', 'high'],
  model,
  thinkingLevel: 'medium',
} as const;

const rawConfiguration = {
  availableThinkingLevels: configuration.availableThinkingLevels,
  model: {
    id: model.id,
    name: model.name,
    provider: model.provider,
  },
  thinkingLevel: configuration.thinkingLevel,
} as const;

function creationPort(
  calls: string[],
  failure?: 'model' | 'thinking' | 'task' | 'throw-task',
): AgentCreationPort {
  return {
    createSession: async () => {
      calls.push('create');
      return { ok: true, value: session };
    },
    setModel: async () => {
      calls.push('model');
      return failure === 'model'
        ? { ok: false, error: { code: 'request_failed', message: 'Model failed.' } }
        : { ok: true, value: rawConfiguration };
    },
    setThinkingLevel: async () => {
      calls.push('thinking');
      return failure === 'thinking'
        ? { ok: false, error: { code: 'request_failed', message: 'Thinking failed.' } }
        : { ok: true, value: rawConfiguration };
    },
    submitTask: async () => {
      calls.push('task');
      if (failure === 'throw-task') throw new Error('transport');
      return failure === 'task'
        ? { ok: false, error: { code: 'request_failed', message: 'Task failed.' } }
        : { ok: true, value: { accepted: true } };
    },
  };
}

test('selects the current workspace and its first daemon Agent', () => {
  const selected = selectInitialAgentWorkspace({
    currentCwd: '/work/ernie',
    sessions: [
      session,
      { ...session, activeSessionId: 'newer', modifiedAt: '2026-08-17T05:00:00.000Z' },
    ],
  });

  assert.deepEqual(selected, { cwd: '/work/ernie', sessionId: 'agent-one' });
});

test('projects repository roots and worktrees without changing their identity', () => {
  const folders = projectAgentWorkspaceFolders(
    ['/work/ernie', '/work/ernie-feature'],
    new Map([
      ['/work/ernie', {
        branchName: 'main',
        cwd: '/work/ernie',
        repositoryCwd: '/work/ernie',
      }],
      ['/work/ernie-feature', {
        branchName: 'feature/calm-ui',
        cwd: '/work/ernie-feature',
        repositoryCwd: '/work/ernie',
      }],
    ]),
  );

  assert.deepEqual(folders, [
    {
      branchName: null,
      label: 'ernie',
      repositoryCwd: '/work/ernie',
      value: '/work/ernie',
    },
    {
      branchName: 'feature/calm-ui',
      label: 'feature/calm-ui',
      repositoryCwd: '/work/ernie',
      value: '/work/ernie-feature',
    },
  ]);
});

test('merges a connected Agent without losing newer daemon fields', () => {
  const merged = connectAgentWorkspaceSession(
    {
      currentCwd: '/work/ernie',
      sessions: [{ ...session, activity: 'working', name: 'Daemon name' }],
    },
    { ...session, model },
  );

  assert.equal(merged.sessions[0]?.name, 'Daemon name');
  assert.equal(merged.sessions[0]?.activity, 'working');
  assert.equal(merged.sessions[0]?.model?.key, model.key);
});

test('projects draft and selected Agent model controls', () => {
  assert.deepEqual(
    projectAgentWorkspaceControls({
      configuration: null,
      draftModelKey: model.key,
      draftThinkingLevel: 'high',
      models: [model],
      selectedSessionId: null,
    }),
    {
      selectedModelKey: model.key,
      selectedThinkingLevel: 'high',
      thinkingLevels: model.thinkingLevels,
    },
  );
  assert.deepEqual(
    projectAgentWorkspaceControls({
      configuration,
      draftModelKey: null,
      draftThinkingLevel: 'low',
      models: [model],
      selectedSessionId: session.activeSessionId,
    }),
    {
      selectedModelKey: model.key,
      selectedThinkingLevel: 'medium',
      thinkingLevels: configuration.availableThinkingLevels,
    },
  );
  const higherEffortModel = {
    ...model,
    key: '["openai","gpt-5.6-high"]',
    thinkingLevels: ['medium', 'high'],
  } as const;
  assert.equal(
    projectAgentWorkspaceControls({
      configuration: null,
      draftModelKey: higherEffortModel.key,
      draftThinkingLevel: 'low',
      models: [higherEffortModel],
      selectedSessionId: null,
    }).selectedThinkingLevel,
    'medium',
  );
});

test('creates, configures, and starts an Agent in strict order', async () => {
  const calls: string[] = [];
  const outcome = await createAgentWithTask(creationPort(calls), {
    cwd: session.cwd,
    message: 'Inspect the workspace architecture',
    model,
    rlmMaxDepth: 2,
    thinkingLevel: 'medium',
  });

  assert.deepEqual(calls, ['create', 'model', 'thinking', 'task']);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.session.activity, 'queued');
  assert.equal(outcome.session.name, 'Inspect the workspace architecture');
});

test('returns protocol failures with the recoverable created Agent', async () => {
  const calls: string[] = [];
  const outcome = await createAgentWithTask(creationPort(calls, 'thinking'), {
    cwd: session.cwd,
    message: 'Start the task',
    model,
    rlmMaxDepth: 1,
    thinkingLevel: 'medium',
  });

  assert.deepEqual(calls, ['create', 'model', 'thinking']);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.unexpected, false);
  assert.equal(outcome.message, 'Thinking failed.');
  assert.equal(outcome.session?.model?.key, model.key);
});

test('returns the current stage message after a transport failure', async () => {
  const calls: string[] = [];
  const outcome = await createAgentWithTask(creationPort(calls, 'throw-task'), {
    cwd: session.cwd,
    message: 'Start the task',
    model,
    rlmMaxDepth: 1,
    thinkingLevel: 'medium',
  });

  assert.deepEqual(calls, ['create', 'model', 'thinking', 'task']);
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.unexpected, true);
  assert.equal(
    outcome.message,
    'Ernie created the Agent, but could not send its first task.',
  );
  assert.equal(outcome.session?.activeSessionId, session.activeSessionId);
});
