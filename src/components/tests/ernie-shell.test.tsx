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

test('user can create a blank Prime Agent session before sending its first task', async () => {
  const createdCwds: string[] = [];
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
    createPrimeAgentSession: async (cwd) => {
      createdCwds.push(cwd);
      return {
        ok: true,
        value: {
          activeSessionId: 'blank-agent',
          cwd,
          name: 'Blank Agent',
          model: null,
          modifiedAt: null,
          sessionPath: null,
        },
      };
    },
    listPrimeAgentSavedSessions: async () => ({ ok: true, value: [] }),
    importPrimeAgentSession: async () => ({ ok: false }),
    renamePrimeAgentSession: async () => ({ ok: false }),
    listPrimeAgentModels: async () => ({ ok: true, value: [] }),
    listPrimeAgentSkills: async () => ({ ok: true, value: [] }),
    setPrimeAgentModel: async () => ({ ok: false }),
    getPrimeAgentRlmDepth: async () => ({
      ok: true,
      value: { maxDepth: 1, source: 'default' },
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

  render(
    <ErnieShell
      agentationEnabled={false}
      darkModeEnabled
      onAgentationEnabledChange={() => undefined}
      onDarkModeEnabledChange={() => undefined}
      onReload={() => undefined}
    />,
  );

  const newAgentButton = await within(document.body).findByRole('button', {
    name: 'New Agent in ernie',
  });
  const repositoryButton = within(document.body).getByRole('button', {
    name: 'ernie',
  });
  await user.click(repositoryButton);
  assert.equal(repositoryButton.getAttribute('aria-expanded'), 'false');

  await user.click(newAgentButton);

  await waitFor(() => {
    assert.deepEqual(createdCwds, ['/workspace/ernie']);
    assert.equal(
      within(document.body)
        .getByRole('button', { name: 'Blank Agent' })
        .getAttribute('aria-current'),
      'page',
    );
  });
  assert.deepEqual(submittedTasks, []);

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
  assert.deepEqual(createdCwds, ['/workspace/ernie']);
});
