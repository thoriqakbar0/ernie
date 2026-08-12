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
      set: (finish: (() => void) | null) => {
        if (finish !== null) queueMicrotask(finish);
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
  const reactGrabChanges: boolean[] = [];
  const createdSessions: Array<
    Parameters<ErnieRendererApi['createPrimeAgentSession']>[0]
  > = [];
  let sessionCreated = false;
  let liveDepth = 5;
  let modelCatalogRequests = 0;
  const changedSessionDepths: Array<{
    activeSessionId: string;
    maxDepth: number;
  }> = [];
  const sessionFeedListeners = new Map<
    string,
    Parameters<ErnieRendererApi['watchPrimeAgentSession']>[1]
  >();
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
    createPrimeAgentSession: async (creation) => {
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
    watchPrimeAgentSession: (activeSessionId, listener) => {
      const subscriptionId = `test-feed:${activeSessionId}`;
      sessionFeedListeners.set(subscriptionId, listener);
      queueMicrotask(() =>
        listener({
          activeSessionId,
          item: {
            kind: 'snapshot',
            view: {
              activeSessionId,
              isStreaming: false,
              messages: [
                { id: 'task', role: 'user', text: 'Polish the sidebar' },
                {
                  id: 'reply',
                  role: 'assistant',
                  text: 'I am working on it.',
                },
              ],
              rlmMaxDepth: liveDepth,
              sessionName: 'Polish the sidebar',
              spawnedSessions: [],
              transcript: [
                {
                  id: 'task',
                  kind: 'message',
                  role: 'user',
                  text: 'Polish the sidebar',
                },
                {
                  id: 'reply',
                  kind: 'message',
                  role: 'assistant',
                  text: 'I am working on it.',
                },
              ],
            },
          },
          revision: 0,
          subscriptionId,
        }),
      );
      return subscriptionId;
    },
    unwatchPrimeAgentSession: (subscriptionId) => {
      sessionFeedListeners.delete(subscriptionId);
    },
    setPrimeAgentModel: async () => ({ ok: false }),
    getPrimeAgentRlmDepth: async () => ({
      ok: true,
      value: { maxDepth: 17, source: 'chat' },
    }),
    setPrimeAgentRlmDepth: async (selection) => {
      changedSessionDepths.push(selection);
      liveDepth = selection.maxDepth;
      return {
        ok: true,
        value: { maxDepth: liveDepth, source: 'chat' },
      };
    },
    submitPrimeAgentTask: async (submission) => {
      submittedTasks.push(submission);
      return { ok: true, value: { accepted: true } };
    },
    refinePrimeAgentSession: async () => ({
      ok: true,
      value: { refined: true },
    }),
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
    showBrowserPlugin: async () => ({ ok: false }),
    hideBrowserPlugin: async () => ({ ok: false }),
    navigateBrowserPlugin: async () => ({ ok: false }),
    goBackBrowserPlugin: async () => ({ ok: false }),
    goForwardBrowserPlugin: async () => ({ ok: false }),
    reloadBrowserPlugin: async () => ({ ok: false }),
    onBrowserPluginState: () => () => undefined,
  };
  Object.defineProperty(window, 'ernie', {
    configurable: true,
    value: rendererApi,
  });
  window.localStorage.setItem('ernie:rlm-max-depth:v1', '4');

  render(
    <ErnieShell
      darkModeEnabled
      onDarkModeEnabledChange={() => undefined}
      onReload={() => undefined}
      onReactGrabEnabledChange={(enabled) => reactGrabChanges.push(enabled)}
      reactGrabEnabled={false}
    />,
  );

  await user.click(within(document.body).getByRole('button', { name: 'Browser' }));
  assert.ok(
    within(document.body).getByRole('textbox', { name: 'Browser address' }),
  );
  assert.ok(
    within(document.body).getByRole('region', { name: 'Browser page' }),
  );
  await user.click(within(document.body).getByRole('button', { name: 'Agents' }));

  assert.equal(
    within(document.body).queryByRole('region', { name: 'Settings' }),
    null,
  );
  await user.click(
    within(document.body).getByRole('button', { name: 'Application settings' }),
  );
  const settings = within(document.body).getByRole('region', {
    name: 'Settings',
  });
  const annotateSwitch = within(settings).getByRole('switch', {
    name: 'Annotate',
  });
  assert.equal(annotateSwitch.getAttribute('aria-checked'), 'false');
  await user.click(within(settings).getByRole('button', { name: 'Manage' }));
  assert.ok(
    await within(document.body).findByRole('dialog', { name: 'Plugins' }),
  );
  await user.keyboard('{Escape}');
  await waitFor(() =>
    assert.equal(
      within(document.body).queryByRole('dialog', { name: 'Plugins' }),
      null,
    ),
  );
  await user.click(annotateSwitch);
  assert.deepEqual(reactGrabChanges, [true]);
  await user.click(
    within(settings).getByRole('button', { name: 'Back to Agent' }),
  );
  await user.click(
    within(document.body).getByRole('button', { name: 'Settings' }),
  );
  assert.ok(
    within(document.body).getByRole('region', { name: 'Settings' }),
  );
  await user.click(
    within(document.body).getByRole('button', { name: 'Application settings' }),
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
  assert.equal(
    within(document.body).queryByRole('button', { name: 'Add context' }),
    null,
  );
  const conversation = await within(document.body).findByRole('region', {
    name: 'Conversation',
  });
  assert.match(conversation.className, /select-text/u);
  assert.ok(
    within(document.body).getByRole('heading', { name: 'Polish the sidebar' }),
  );
  assert.ok(within(document.body).getByText('I am working on it.'));
  const sessionFeed = sessionFeedListeners.get('test-feed:blank-agent');
  assert.notEqual(sessionFeed, undefined);
  sessionFeed?.({
    activeSessionId: 'blank-agent',
    item: {
      kind: 'conversation-replaced',
      isStreaming: true,
      messages: [
        { id: 'task', role: 'user', text: 'Polish the sidebar' },
        { id: 'reply', role: 'assistant', text: 'Live event received.' },
      ],
      transcript: [
        {
          id: 'task',
          kind: 'message',
          role: 'user',
          text: 'Polish the sidebar',
        },
        {
          id: 'reply',
          kind: 'message',
          role: 'assistant',
          text: 'Live event received.',
        },
      ],
    },
    revision: 1,
    subscriptionId: 'test-feed:blank-agent',
  });
  assert.ok(await within(document.body).findByText('Live event received.'));
  await user.click(
    within(document.body).getByRole('button', { name: 'Depth 5' }),
  );
  await user.click(
    within(document.body).getByRole('button', {
      name: 'Increase Agent depth',
    }),
  );
  await waitFor(() =>
    assert.deepEqual(changedSessionDepths, [
      { activeSessionId: 'blank-agent', maxDepth: 6 },
    ]),
  );
  assert.ok(
    within(document.body).getByRole('button', { name: 'Depth 6' }),
  );

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
      .getByRole('button', { name: 'Polish the sidebar' })
      .getAttribute('aria-current'),
    null,
  );
});
