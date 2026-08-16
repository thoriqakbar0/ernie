import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TaskSurface } from '@/components/task-surface';
import { createPrimeAgentRendererClientFixture } from '@/components/tests/prime-agent-renderer-client-fixture';
import type { AgentWorkspaceController } from '@/packages/agent-workspace';

Object.defineProperty(Element.prototype, 'getAnimations', {
  configurable: true,
  value: () => [],
});
Object.defineProperty(Element.prototype, 'animate', {
  configurable: true,
  value: () => ({ cancel: () => undefined }),
});

afterEach(cleanup);

const agentClient = createPrimeAgentRendererClientFixture();

function unavailableWorkspace(): AgentWorkspaceController {
  return {
    busy: false,
    folders: [],
    gitBranch: null,
    gitBranchBusy: false,
    gitBranches: [],
    gitWorktreeError: null,
    creatingAgent: false,
    loadingWorkspace: false,
    loadingSavedSessions: false,
    loadingEarlierHistory: false,
    importingSessionPath: null,
    renamingSession: false,
    modelBusy: false,
    models: [],
    primeAgentConnection: 'unavailable',
    skills: [],
    repoName: 'Workspace',
    rlmMaxDepth: 1,
    rlmMaxDepthBusy: false,
    selectedCwd: null,
    selectedModelKey: null,
    selectedThinkingLevel: null,
    selectedAgentIdentity: null,
    selectedSessionId: null,
    selectedSessionView: null,
    selectedSessionRlmMaxDepth: null,
    selectedSessionRlmMaxDepthBusy: false,
    sessions: [],
    savedSessions: [],
    status: 'The Prime Agent daemon is not available.',
    thinkingLevelBusy: false,
    thinkingLevels: [],
    changeFolder: () => undefined,
    startAgentDraft: () => undefined,
    createAgentWithTask: async () => ({ ok: false, message: 'Unavailable' }),
    loadSavedSessions: () => undefined,
    loadEarlierSessionHistory: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
    openSpawnedSession: () => undefined,
    chooseWorkspaceDirectory: () => undefined,
    addWorkspaceDirectory: async () => null,
    changeGitBranch: () => undefined,
    deleteGitBranch: () => undefined,
    initializeGitRepository: () => undefined,
    createGitWorktree: () => undefined,
    changeModel: () => undefined,
    changeThinkingLevel: () => undefined,
    changeRlmMaxDepth: () => undefined,
    changeSelectedSessionRlmMaxDepth: () => undefined,
  };
}

test('unavailable Agent disables launch controls and offers one retry', async () => {
  let retries = 0;
  const user = userEvent.setup();

  render(
    <TaskSurface
      agentClient={agentClient}
      workspace={unavailableWorkspace()}
      thinkingOrbState="working"
      onRetryConnection={() => {
        retries += 1;
      }}
    />,
  );

  assert.ok(
    within(document.body).getByRole('heading', {
      name: 'Ernie',
    }),
  );
  assert.ok(
    within(document.body).getByText(
      'An experiment in jellyware: an RLM-able interface that follows the work',
    ),
  );

  assert.equal(
    within(document.body).getByRole('textbox', { name: 'Give Ernie a task' })
      .getAttribute('disabled'),
    '',
  );
  assert.equal(
    within(document.body).getByRole('button', { name: 'Send task' })
      .getAttribute('disabled'),
    '',
  );
  assert.ok(within(document.body).getByText('Prime Agent is unavailable.'));

  await user.click(within(document.body).getByRole('button', { name: 'Retry' }));
  assert.equal(retries, 1);
});

test('working Agent shows its hydrated conversation before a response', () => {
  render(
    <TaskSurface
      agentClient={agentClient}
      workspace={{
        ...unavailableWorkspace(),
        primeAgentConnection: 'ready',
        selectedCwd: '/workspace/ernie',
        selectedAgentIdentity: {
          kind: 'spawned',
          name: 'Research interaction patterns',
          number: 2,
        },
        selectedSessionId: 'active-agent',
        selectedSessionView: {
          activeSessionId: 'active-agent',
          historyStart: 0,
          isStreaming: true,
          messages: [
            {
              id: 'active-agent:0',
              role: 'user',
              text: 'Inspect the daemon',
            },
          ],
          rlmMaxDepth: 1,
          sessionName: 'Inspect the daemon',
          spawnedSessions: [],
          transcript: [
            {
              id: 'active-agent:0',
              kind: 'message',
              role: 'user',
              text: 'Inspect the daemon',
            },
          ],
        },
        sessions: [
          {
            activeSessionId: 'active-agent',
            activity: 'working',
            cwd: '/workspace/ernie',
            model: null,
            modifiedAt: null,
            name: 'Active Agent',
            sessionPath: null,
          },
        ],
      }}
      thinkingOrbState="working"
      onRetryConnection={() => undefined}
    />,
  );

  assert.ok(within(document.body).getByRole('region', { name: 'Conversation' }));
  assert.ok(within(document.body).getByRole('article', { name: 'Your message' }));
  assert.ok(
    within(document.body).getByRole('textbox', { name: 'Give Ernie a task' }),
  );
  assert.equal(
    within(document.body).queryByRole('status', {
      name: 'Current agent: Agent 2 · Research interaction patterns',
    }),
    null,
  );
});

test('settled Agent keeps its AI response visible', () => {
  render(
    <TaskSurface
      agentClient={agentClient}
      workspace={{
        ...unavailableWorkspace(),
        primeAgentConnection: 'ready',
        selectedCwd: '/workspace/ernie',
        selectedSessionId: 'settled-agent',
        selectedSessionView: {
          activeSessionId: 'settled-agent',
          historyStart: 0,
          isStreaming: false,
          messages: [
            {
              id: 'settled-agent:0',
              role: 'assistant',
              text: 'The daemon is healthy.',
            },
          ],
          rlmMaxDepth: 1,
          sessionName: 'Inspect the daemon',
          spawnedSessions: [],
          transcript: [
            {
              id: 'settled-agent:0',
              kind: 'message',
              role: 'assistant',
              text: 'The daemon is healthy.',
            },
          ],
        },
        sessions: [
          {
            activeSessionId: 'settled-agent',
            activity: 'settled',
            cwd: '/workspace/ernie',
            model: null,
            modifiedAt: null,
            name: 'Settled Agent',
            sessionPath: null,
          },
        ],
      }}
      thinkingOrbState="working"
      onRetryConnection={() => undefined}
    />,
  );

  assert.ok(within(document.body).getByRole('article', { name: 'Agent response' }));
  assert.ok(within(document.body).getByText('The daemon is healthy.'));
});
