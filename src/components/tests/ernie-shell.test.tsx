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

test('user can create a blank Prime Agent session in the selected repository before sending its first task', async () => {
  const createdSessions: unknown[] = [];
  let createdRlmMaxDepth = 1;
  const submittedTasks: Array<{
    activeSessionId: string;
    message: string;
  }> = [];
  const user = userEvent.setup();
  const rendererApi: ErnieRendererApi = {
    signalReady: () => undefined,
    listPrimeAgentWorkspace: async () => ({
      ok: true,
      value: { currentCwd: '/workspace/ernie', sessions: [] },
    }),
    createPrimeAgentSession: async (creation: unknown) => {
      createdSessions.push(creation);
      if (
        typeof creation === 'object' &&
        creation !== null &&
        'rlmMaxDepth' in creation &&
        typeof creation.rlmMaxDepth === 'number'
      ) {
        createdRlmMaxDepth = creation.rlmMaxDepth;
      }
      return {
        ok: true,
        value: {
          activeSessionId: 'blank-agent',
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
    listPrimeAgentModels: async () => ({ ok: true, value: [] }),
    listPrimeAgentSkills: async () => ({ ok: true, value: [] }),
    setPrimeAgentModel: async () => ({ ok: false }),
    getPrimeAgentRlmDepth: async () => ({
      ok: true,
      value: { maxDepth: createdRlmMaxDepth, source: 'chat' },
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
  const repositoryButton = within(document.body).getByRole('button', {
    name: 'kastuli',
  });
  await user.click(repositoryButton);
  assert.equal(repositoryButton.getAttribute('aria-expanded'), 'false');

  await user.click(
    within(document.body).getByRole('button', { name: 'Start Agent' }),
  );

  await waitFor(() => {
    assert.deepEqual(createdSessions, [
      { cwd: '/workspace/kastuli', rlmMaxDepth: 5 },
    ]);
    assert.equal(
      within(document.body)
        .getByRole('button', { name: 'Blank Agent' })
        .getAttribute('aria-current'),
      'page',
    );
  });
  assert.deepEqual(submittedTasks, []);
  assert.ok(
    await within(document.body).findByRole('button', { name: 'Depth 5' }),
  );
  assert.ok(
    within(document.body).getByRole('button', { name: 'Add context' }),
  );

  await user.type(
    within(document.body).getByRole('textbox', {
      name: 'Give Ernie a task',
    }),
    'Polish the sidebar{Enter}',
  );

  await waitFor(() =>
    assert.deepEqual(submittedTasks, [
      {
        activeSessionId: 'blank-agent',
        message: 'Polish the sidebar',
      },
    ]),
  );
  assert.deepEqual(createdSessions, [
    { cwd: '/workspace/kastuli', rlmMaxDepth: 5 },
  ]);
});
