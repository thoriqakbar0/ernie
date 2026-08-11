import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ErnieShell } from '@/components/ernie-shell';
import type { ErnieRendererApi } from '@/renderer-api';

// Happy DOM does not implement the Web Animations APIs used by Torph.
Object.defineProperty(Element.prototype, 'getAnimations', {
  configurable: true,
  value: () => [],
});
Object.defineProperty(Element.prototype, 'animate', {
  configurable: true,
  value: () => {
    const animation = { cancel: () => undefined };

    Object.defineProperty(animation, 'onfinish', {
      set: (finish: unknown) => {
        if (typeof finish === 'function') queueMicrotask(() => finish());
      },
    });

    return animation;
  },
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

test('repository plus opens a draft and the first message creates the Prime Agent session', async () => {
  const createdSessions: unknown[] = [];
  let sessionCreated = false;
  let modelCatalogRequests = 0;
  const submittedTasks: Array<{
    activeSessionId: string;
    message: string;
  }> = [];
  const user = userEvent.setup();
  const rendererApi: ErnieRendererApi = {
    signalReady: () => undefined,
    listPrimeAgentWorkspace: async () => ({
      ok: true,
      value: {
        currentCwd: '/workspace/ernie',
        sessions: sessionCreated
          ? [
              {
                activeSessionId: 'blank-agent',
                activity: 'working',
                cwd: '/workspace/kastuli',
                name: 'Blank Agent',
                model: null,
                modifiedAt: null,
                sessionPath: null,
              },
            ]
          : [],
      },
    }),
    createPrimeAgentSession: async (creation: unknown) => {
      createdSessions.push(creation);
      sessionCreated = true;
      return {
        ok: true,
        value: {
          activeSessionId: 'blank-agent',
          activity: 'idle',
          cwd: '/workspace/kastuli',
          name: 'Blank Agent',
          model: null,
          modifiedAt: null,
          sessionPath: null,
        },
      };
    },
    listPrimeAgentSavedSessions: async () => ({
      ok: true,
      value: [
        {
          cwd: '/workspace/kastuli',
          messageCount: 1,
          modifiedAt: '2026-08-11T10:00:00.000Z',
          name: 'Saved Agent',
          path: '/sessions/kastuli.jsonl',
        },
      ],
    }),
    importPrimeAgentSession: async () => ({ ok: false }),
    renamePrimeAgentSession: async () => ({ ok: false }),
    listPrimeAgentModels: async () => {
      modelCatalogRequests += 1;
      return { ok: true, value: [] };
    },
    listPrimeAgentSkills: async () => ({ ok: true, value: [] }),
    setPrimeAgentModel: async () => ({ ok: false }),
    getPrimeAgentRlmDepth: async () => ({
      ok: true,
      value: { maxDepth: 17, source: 'chat' },
    }),
    setPrimeAgentRlmDepth: async () => ({ ok: false }),
    submitPrimeAgentTask: async (submission) => {
      submittedTasks.push(submission);
      return { ok: true, value: { accepted: true } };
    },
    listPrimeAgentGitBranches: async (cwd) => ({
      ok: true,
      value: { cwd, current: 'main', names: ['main'] },
    }),
    readPrimeAgentGitWorkspace: async (cwd) => ({
      ok: true,
      value: { branchName: 'main', cwd, repositoryCwd: cwd },
    }),
    switchPrimeAgentGitBranch: async () => ({ ok: false }),
    deletePrimeAgentGitBranch: async () => ({ ok: false }),
    renamePrimeAgentGitBranch: async () => ({ ok: false }),
    initializePrimeAgentGit: async () => ({ ok: false }),
    createPrimeAgentGitWorktree: async () => ({ ok: false }),
    chooseWorkspaceDirectory: async () => null,
  };
  Object.defineProperty(window, 'ernie', {
    configurable: true,
    value: rendererApi,
  });
  window.localStorage.setItem('ernie:rlm-max-depth:v1', '4');

  render(
    <ErnieShell
      agentationEnabled={false}
      darkModeEnabled
      onAgentationEnabledChange={() => undefined}
      onDarkModeEnabledChange={() => undefined}
      onReload={() => undefined}
    />,
  );

  assert.ok(await within(document.body).findByText('Prime Agent ready'));
  assert.ok(
    within(document.body).getByRole('region', {
      name: 'New Agent settings',
    }),
  );
  assert.equal(
    within(document.body).queryByRole('button', {
      name: 'Depth unavailable',
    }),
    null,
  );
  await user.click(
    within(document.body).getByRole('button', { name: 'Depth 4' }),
  );
  await user.click(
    within(document.body).getByRole('button', {
      name: 'Increase Agent depth',
    }),
  );
  assert.equal(
    window.localStorage.getItem('ernie:rlm-max-depth:v1'),
    '5',
  );
  assert.equal(
    within(document.body).queryByRole('button', { name: 'Add context' }),
    null,
  );
  assert.equal(
    within(document.body).queryByRole('button', { name: 'Model' }),
    null,
  );
  await user.click(
    within(document.body).getByRole('button', { name: 'New Agent in kastuli' }),
  );

  await waitFor(() => assert.deepEqual(createdSessions, []));
  assert.deepEqual(submittedTasks, []);
  assert.equal(
    within(document.body).queryByRole('button', { name: 'Start Agent' }),
    null,
  );
  assert.equal(
    within(document.body).queryByRole('button', { name: 'Add context' }),
    null,
  );

  await user.type(
    within(document.body).getByRole('textbox', {
      name: 'Give Ernie a task',
    }),
    'Polish the sidebar{Enter}',
  );

  await waitFor(() =>
    assert.deepEqual(createdSessions, [
      { cwd: '/workspace/kastuli', rlmMaxDepth: 5 },
    ]),
  );
  assert.deepEqual(submittedTasks, [
    {
      activeSessionId: 'blank-agent',
      message: 'Polish the sidebar',
    },
  ]);
  assert.deepEqual(createdSessions, [
    { cwd: '/workspace/kastuli', rlmMaxDepth: 5 },
  ]);
  assert.equal(
    within(document.body)
      .getByRole('button', { name: 'Blank Agent' })
      .getAttribute('aria-current'),
    'page',
  );
  await waitFor(
    () => assert.ok(within(document.body).getByLabelText('Working')),
    { timeout: 2_500 },
  );
  await waitFor(() => assert.equal(modelCatalogRequests, 1));
  assert.equal(
    within(document.body).queryByRole('region', {
      name: 'New Agent settings',
    }),
    null,
  );
  assert.ok(within(document.body).getByRole('button', { name: 'Add context' }));

  await user.click(
    within(document.body).getByRole('button', { name: 'New Agent in kastuli' }),
  );
  assert.ok(
    within(document.body).getByRole('region', {
      name: 'New Agent settings',
    }),
  );
  assert.ok(within(document.body).getByRole('button', { name: 'Depth 5' }));
  assert.equal(
    within(document.body).queryByRole('button', { name: 'Add context' }),
    null,
  );
  assert.equal(window.localStorage.getItem('ernie:rlm-max-depth:v1'), '5');

  const folderPicker = within(document.body).getByRole('combobox', {
    name: 'Folder location',
  });
  await user.click(folderPicker);
  await user.click(
    within(document.body).getByRole('option', { name: /ernie/u }),
  );
  await user.click(folderPicker);
  await user.click(
    within(document.body).getByRole('option', { name: /kastuli/u }),
  );

  assert.ok(
    within(document.body).getByRole('region', {
      name: 'New Agent settings',
    }),
  );
  assert.equal(
    within(document.body)
      .getByRole('button', { name: 'Blank Agent' })
      .getAttribute('aria-current'),
    null,
  );
});
