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
    composer: {
      creatingAgent: false,
      modelBusy: false,
      models: [],
      skills: [],
      rlmMaxDepth: 1,
      rlmMaxDepthBusy: false,
      selectedModelKey: null,
      selectedThinkingLevel: null,
      selectedSessionRlmMaxDepth: null,
      selectedSessionRlmMaxDepthBusy: false,
      thinkingLevelBusy: false,
      thinkingLevels: [],
      createAgentWithTask: async () => ({ ok: false, message: 'Unavailable' }),
      changeModel: () => undefined,
      changeThinkingLevel: () => undefined,
      changeRlmMaxDepth: () => undefined,
      changeSelectedSessionRlmMaxDepth: () => undefined,
    },
    connection: {
      loadingWorkspace: false,
      primeAgentConnection: 'unavailable',
      status: 'The Prime Agent daemon is not available.',
    },
    conversation: {
      loadingEarlierHistory: false,
      selectedAgentIdentity: null,
      selectedSessionView: null,
      loadEarlierSessionHistory: () => undefined,
      openSpawnedSession: () => undefined,
    },
    git: {
      gitBranch: null,
      gitBranchBusy: false,
      gitBranches: [],
      gitWorktreeError: null,
      changeGitBranch: () => undefined,
      deleteGitBranch: () => undefined,
      initializeGitRepository: () => undefined,
      createGitWorktree: () => undefined,
    },
    navigation: {
      busy: false,
      folders: [],
      loadingSavedSessions: false,
      importingSessionPath: null,
      renamingSession: false,
      repoName: 'Workspace',
      selectedCwd: null,
      selectedSessionId: null,
      sessions: [],
      savedSessions: [],
      changeFolder: () => undefined,
      startAgentDraft: () => undefined,
      loadSavedSessions: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
      chooseWorkspaceDirectory: () => undefined,
      addWorkspaceDirectory: async () => null,
    },
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
  const unavailable = unavailableWorkspace();
  render(
    <TaskSurface
      agentClient={agentClient}
      workspace={{
        ...unavailable,
        connection: {
          ...unavailable.connection,
          primeAgentConnection: 'ready',
        },
        conversation: {
          ...unavailable.conversation,
          selectedAgentIdentity: {
            kind: 'spawned',
            name: 'Research interaction patterns',
            number: 2,
          },
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
        },
        navigation: {
          ...unavailable.navigation,
          selectedCwd: '/workspace/ernie',
          selectedSessionId: 'active-agent',
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
        },
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
  const unavailable = unavailableWorkspace();
  render(
    <TaskSurface
      agentClient={agentClient}
      workspace={{
        ...unavailable,
        connection: {
          ...unavailable.connection,
          primeAgentConnection: 'ready',
        },
        conversation: {
          ...unavailable.conversation,
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
        },
        navigation: {
          ...unavailable.navigation,
          selectedCwd: '/workspace/ernie',
          selectedSessionId: 'settled-agent',
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
        },
      }}
      thinkingOrbState="working"
      onRetryConnection={() => undefined}
    />,
  );

  assert.ok(within(document.body).getByRole('article', { name: 'Agent response' }));
  assert.ok(within(document.body).getByText('The daemon is healthy.'));
});
