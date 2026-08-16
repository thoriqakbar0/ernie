import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  connectAgentWorkspaceSession,
  createAgentSessionLifecycle,
  createAgentGitWorkspaceService,
  createAgentWithTask,
  projectAgentWorkspaceControls,
  projectAgentWorkspaceFolders,
  selectInitialAgentWorkspace,
  type AgentCreationPort,
  type AgentGitWorkspacePort,
} from '../index';
import type { PrimeAgentSessionFeedState } from '../../prime-agent-daemon/events';

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
        : { ok: true, value: configuration };
    },
    setThinkingLevel: async () => {
      calls.push('thinking');
      return failure === 'thinking'
        ? { ok: false, error: { code: 'request_failed', message: 'Thinking failed.' } }
        : { ok: true, value: configuration };
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
  assert.equal(outcome.error.name, 'AgentCreationTransportError');
  assert.equal(outcome.error.stage, 'task');
  assert.equal((outcome.error.cause as Error).message, 'transport');
  assert.equal(
    outcome.message,
    'Ernie created the Agent, but could not send its first task.',
  );
  assert.equal(outcome.session?.activeSessionId, session.activeSessionId);
});

test('preserves cancellation instead of translating it into a failure', async () => {
  const cancellation = new DOMException('cancelled', 'AbortError');
  const port: AgentCreationPort = {
    ...creationPort([]),
    createSession: async () => Promise.reject(cancellation),
  };

  await assert.rejects(
    createAgentWithTask(port, {
      cwd: session.cwd,
      message: 'Start the task',
      model,
      rlmMaxDepth: 1,
      thinkingLevel: 'medium',
    }),
    cancellation,
  );
});

test('owns earlier-history loading, cache updates, and completion', async () => {
  const lifecycle = createAgentSessionLifecycle();
  const view = {
    activeSessionId: session.activeSessionId,
    historyStart: 1,
    isStreaming: false,
    messages: [],
    rlmMaxDepth: 1,
    sessionName: session.name,
    spawnedSessions: [],
    transcript: [{
      id: 'message-1',
      kind: 'message',
      role: 'assistant',
      text: 'Newer response',
    }],
  } as const;
  let feed: PrimeAgentSessionFeedState = {
    activeSessionId: session.activeSessionId,
    kind: 'live',
    revision: 0,
    subscriptionId: 'test-feed',
    view,
  };
  const statuses: string[] = [];
  let starts = 0;
  let finishes = 0;

  assert.equal(
    lifecycle.loadEarlierHistory(
      {
        loadHistory: async () => ({
          ok: true,
          value: {
            activeSessionId: session.activeSessionId,
            start: 0,
            transcript: [{
              id: 'message-0',
              kind: 'message',
              role: 'user',
              text: 'Earlier task',
            }],
          },
        }),
      },
      view,
      {
        currentFeed: () => feed,
        onFeed: (next) => {
          feed = next;
        },
        onFinished: () => {
          finishes += 1;
        },
        onStarted: () => {
          starts += 1;
        },
        onStatus: (message) => statuses.push(message),
      },
    ),
    true,
  );

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(starts, 1);
  assert.equal(finishes, 1);
  assert.equal(statuses.at(-1), 'Loaded earlier Agent history.');
  assert.equal(lifecycle.peek(session.activeSessionId)?.historyStart, 0);
  assert.equal(lifecycle.peek(session.activeSessionId)?.transcript.length, 2);
  lifecycle.close();
});

test('owns local Git transition messages and workspace identification', async () => {
  const branches = {
    cwd: session.cwd,
    current: 'main',
    names: ['main'],
  } as const;
  const port: AgentGitWorkspacePort = {
    createWorktree: async ({ branchName }) => ({
      ok: true,
      value: { branchName, cwd: `${session.cwd}-${branchName}` },
    }),
    deleteBranch: async () => ({ ok: true, value: branches }),
    initializeGit: async () => ({ ok: true, value: branches }),
    readWorkspace: async (cwd) =>
      cwd.endsWith('missing')
        ? { ok: false, error: { code: 'request_failed', message: 'Missing.' } }
        : {
            ok: true,
            value: { branchName: 'main', cwd, repositoryCwd: session.cwd },
          },
    switchBranch: async ({ name }) => ({
      ok: true,
      value: { ...branches, current: name },
    }),
  };
  const service = createAgentGitWorkspaceService(port);

  const switched = await service.switchBranch({
    cwd: session.cwd,
    name: 'feature/calm',
  });
  assert.equal(switched.ok, true);
  if (switched.ok) {
    assert.equal(switched.status, 'Git branch changed to feature/calm.');
  }
  const identified = await service.identifyWorkspaces([
    session.cwd,
    `${session.cwd}-missing`,
  ]);
  assert.deepEqual([...identified.keys()], [session.cwd]);
});
