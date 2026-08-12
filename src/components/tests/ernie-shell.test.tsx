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
          activity: 'idle',
          cwd: '/workspace/kastuli',
          messageCount: 1,
          modifiedAt: '2026-08-11T10:00:00.000Z',
          name: 'Saved Agent',
          path: '/sessions/kastuli.jsonl',
        },
        {
          activity: 'settled',
          cwd: '/workspace/ernie-prime-agent-deleted',
          messageCount: 1,
          modifiedAt: '2026-08-10T10:00:00.000Z',
          name: 'Stale test Agent',
          path: '/sessions/stale.jsonl',
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
    getPrimeAgentSessionView: async (activeSessionId) => ({
      ok: true,
      value: {
        activeSessionId,
        messages: [
          { id: 'task', role: 'user', text: 'Polish the sidebar' },
          { id: 'reply', role: 'assistant', text: 'I am working on it.' },
        ],
        rlmMaxDepth: 5,
        spawnedSessions: [],
      },
    }),
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
    readPrimeAgentGitWorkspace: async (cwd) =>
      cwd.endsWith('deleted')
        ? { ok: false }
        : {
            ok: true,
            value: { branchName: 'main', cwd, repositoryCwd: cwd },
          },
    switchPrimeAgentGitBranch: async () => ({ ok: false }),
    deletePrimeAgentGitBranch: async () => ({ ok: false }),
    renamePrimeAgentGitBranch: async () => ({ ok: false }),
    initializePrimeAgentGit: async () => ({ ok: false }),
    createPrimeAgentGitWorktree: async () => ({ ok: false }),
    chooseWorkspaceDirectory: async () => null,
    revealWorkspacePath: async () => true,
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

  assert.ok(
    await within(document.body).findByRole('button', {
      name: 'New Agent in kastuli',
    }),
  );
  assert.equal(within(document.body).queryByText('Prime Agent ready'), null);
  assert.equal(
    within(document.body).queryByRole('button', {
      name: 'Stale test Agent, saved session',
    }),
    null,
  );
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
      .getByRole('button', { name: 'ernie' })
      .getAttribute('aria-expanded'),
    'true',
  );
  assert.equal(
    within(document.body)
      .getByRole('button', { name: 'kastuli' })
      .getAttribute('aria-expanded'),
    'false',
  );
  await waitFor(
    () =>
      assert.match(
        within(document.body).getByRole('button', { name: 'kastuli' })
          .textContent ?? '',
        /1 working/u,
      ),
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
  const conversation = await within(document.body).findByRole('region', {
    name: 'Conversation',
  });
  assert.match(conversation.className, /select-text/u);
  assert.ok(within(document.body).getByRole('heading', { name: 'Blank Agent' }));
  assert.ok(within(document.body).getByText('I am working on it.'));

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
  await user.click(
    within(document.body).getByRole('button', { name: 'kastuli' }),
  );
  assert.equal(
    within(document.body)
      .getByRole('button', { name: 'Blank Agent' })
      .getAttribute('aria-current'),
    null,
  );
});
