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

test('working Agent keeps the empty response area quiet', () => {
  render(
    <TaskSurface
      workspace={{
        ...unavailableWorkspace(),
        primeAgentConnection: 'ready',
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
      }}
      onRetryConnection={() => undefined}
    />,
  );

  assert.equal(within(document.body).queryByText('Agent working'), null);
  assert.equal(
    within(document.body).queryByText('Waiting for the first response'),
    null,
  );
  assert.ok(
    within(document.body).getByRole('textbox', { name: 'Give Ernie a task' }),
  );
});
