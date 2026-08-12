import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TaskSurface } from '@/components/task-surface';
import type { PrimeAgentWorkspaceController } from '@/hooks/use-prime-agent-workspace';

Object.defineProperty(Element.prototype, 'getAnimations', {
  configurable: true,
  value: () => [],
});
Object.defineProperty(Element.prototype, 'animate', {
  configurable: true,
  value: () => ({ cancel: () => undefined }),
});

afterEach(cleanup);

function unavailableWorkspace(): PrimeAgentWorkspaceController {
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
    selectedSessionId: null,
    selectedSessionView: null,
    selectedSessionRlmMaxDepth: null,
    selectedSessionRlmMaxDepthBusy: false,
    sessionPreviews: {},
    sessions: [],
    savedSessions: [],
    status: 'The Prime Agent daemon is not available.',
    changeFolder: () => undefined,
    startAgentDraft: () => undefined,
    createAgentWithTask: async () => ({ ok: false, message: 'Unavailable' }),
    loadSavedSessions: () => undefined,
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
    changeRlmMaxDepth: () => undefined,
    changeSelectedSessionRlmMaxDepth: () => undefined,
  };
}

test('unavailable Agent disables launch controls and offers one retry', async () => {
  let retries = 0;
  const user = userEvent.setup();

  render(
    <TaskSurface
      workspace={unavailableWorkspace()}
      onRetryConnection={() => {
        retries += 1;
      }}
    />,
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
      workspace={{
        ...unavailableWorkspace(),
        primeAgentConnection: 'ready',
        selectedCwd: '/workspace/ernie',
        selectedSessionId: 'active-agent',
        selectedSessionView: {
          activeSessionId: 'active-agent',
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
      onRetryConnection={() => undefined}
    />,
  );

  assert.ok(within(document.body).getByRole('region', { name: 'Conversation' }));
  assert.ok(within(document.body).getByRole('article', { name: 'Your message' }));
  assert.ok(
    within(document.body).getByRole('textbox', { name: 'Give Ernie a task' }),
  );
});

test('settled Agent keeps its AI response visible', () => {
  render(
    <TaskSurface
      workspace={{
        ...unavailableWorkspace(),
        primeAgentConnection: 'ready',
        selectedCwd: '/workspace/ernie',
        selectedSessionId: 'settled-agent',
        selectedSessionView: {
          activeSessionId: 'settled-agent',
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
      onRetryConnection={() => undefined}
    />,
  );

  assert.ok(within(document.body).getByRole('article', { name: 'Agent response' }));
  assert.ok(within(document.body).getByText('The daemon is healthy.'));
});
