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
  const createdSessions: Array<
    Parameters<ErnieRendererApi['createAgentSession']>[0]
  > = [];
  let sessionCreated = false;
  let liveDepth = 5;
  let modelCatalogRequests = 0;
  let sessionFeedWatchCount = 0;
  const changedSessionDepths: Array<{
    activeSessionId: string;
    maxDepth: number;
  }> = [];
  const sessionFeedListeners = new Map<
    string,
    Parameters<ErnieRendererApi['watchAgentSession']>[1]
  >();
  const workspaceFeedListeners = new Map<
    string,
    Parameters<ErnieRendererApi['watchAgentWorkspace']>[0]
  >();
  const submittedTasks: Array<{
    activeSessionId: string;
    message: string;
  }> = [];
  const user = userEvent.setup();
  const rendererApi: ErnieRendererApi = {
    signalReady: () => undefined,
    onColorThemeRequest: () => () => undefined,
    onSidebarControlRequest: () => () => undefined,
    describeAgentHarness: async () => ({
      capabilities: ['live-sessions'],
      id: 'prime-agent',
      name: 'Prime Agent',
    }),
    listAgentWorkspace: async () => ({
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
    watchAgentWorkspace: (listener) => {
      const subscriptionId = 'test-workspace-feed';
      workspaceFeedListeners.set(subscriptionId, listener);
      queueMicrotask(() => {
        listener({ kind: 'connection-changed', status: 'connecting' });
        listener({
          kind: 'workspace-replaced',
          workspace: {
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
        });
        listener({ kind: 'connection-changed', status: 'ready' });
      });
      return subscriptionId;
    },
    unwatchAgentWorkspace: (subscriptionId) => {
      workspaceFeedListeners.delete(subscriptionId);
    },
    createAgentSession: async (creation) => {
      createdSessions.push(creation);
      sessionCreated = true;
      queueMicrotask(() => {
        workspaceFeedListeners.get('test-workspace-feed')?.({
          kind: 'workspace-replaced',
          workspace: {
            currentCwd: '/workspace/ernie',
            sessions: [
              {
                activeSessionId: 'blank-agent',
                activity: 'working',
                cwd: '/workspace/kastuli',
                name: 'Blank Agent',
                model: null,
                modifiedAt: null,
                sessionPath: null,
              },
            ],
          },
        });
      });
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
    listAgentSavedSessions: async () => ({
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
    importAgentSession: async () => ({ ok: false }),
    renameAgentSession: async () => ({ ok: false }),
    listAgentModels: async () => {
      modelCatalogRequests += 1;
      return { ok: true, value: [] };
    },
    listAgentSkills: async () => ({ ok: true, value: [] }),
    watchAgentSession: (activeSessionId, listener) => {
      sessionFeedWatchCount += 1;
      const subscriptionId = `test-feed:${activeSessionId}`;
      sessionFeedListeners.set(subscriptionId, listener);
      if (sessionFeedWatchCount === 1) {
        queueMicrotask(() =>
          listener({
            activeSessionId,
            item: {
              kind: 'snapshot',
              previousHistoryStart: null,
              view: {
                activeSessionId,
                historyStart: 0,
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
      }
      return subscriptionId;
    },
    unwatchAgentSession: (subscriptionId) => {
      sessionFeedListeners.delete(subscriptionId);
    },
    loadAgentSessionHistory: async () => ({
      ok: false,
      error: {
        code: 'unsupported_operation',
        message: 'History loading is not used by this test.',
      },
    }),
    setAgentModel: async () => ({ ok: false }),
    getAgentRlmDepth: async () => ({
      ok: true,
      value: { maxDepth: 17, source: 'chat' },
    }),
    setAgentRlmDepth: async (selection) => {
      changedSessionDepths.push(selection);
      liveDepth = selection.maxDepth;
      return {
        ok: true,
        value: { maxDepth: liveDepth, source: 'chat' },
      };
    },
    submitAgentTask: async (submission) => {
      submittedTasks.push(submission);
      return { ok: true, value: { accepted: true } };
    },
    refineAgentSession: async () => ({
      ok: true,
      value: { refined: true },
    }),
    listGitBranches: async (cwd) => ({
      ok: true,
      value: { cwd, current: 'main', names: ['main'] },
    }),
    readGitWorkspace: async (cwd) =>
      cwd.endsWith('deleted')
        ? { ok: false }
        : {
            ok: true,
            value: { branchName: 'main', cwd, repositoryCwd: cwd },
          },
    switchGitBranch: async () => ({ ok: false }),
    deleteGitBranch: async () => ({ ok: false }),
    renameGitBranch: async () => ({ ok: false }),
    initializeGit: async () => ({ ok: false }),
    createGitWorktree: async () => ({ ok: false }),
    chooseWorkspaceDirectory: async () => null,
    revealWorkspacePath: async () => true,
    acquireBrowserPlugin: async () => ({
      ok: true,
      lease: { id: 'test-browser-lease' },
    }),
    releaseBrowserPlugin: async () => ({ ok: true }),
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
      onThinkingOrbStateChange={() => undefined}
      sidebarControlRequest={null}
      thinkingOrbState="working"
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
    within(document.body).getByRole('button', { name: 'Settings' }),
  );
  const settings = within(document.body).getByRole('region', {
    name: 'Settings',
  });
  await user.click(within(settings).getByRole('button', { name: 'Manage' }));
  const pluginDialog = await within(document.body).findByRole('dialog', {
    name: 'Plugins',
  });
  const browserPluginSwitch = within(pluginDialog).getByRole('switch', {
    name: 'Enable Browser plugin',
  });
  assert.equal(browserPluginSwitch.getAttribute('aria-checked'), 'true');
  await user.click(browserPluginSwitch);
  await waitFor(() =>
    assert.equal(
      within(document.body).queryByRole('button', { name: 'Browser' }),
      null,
    ),
  );
  assert.equal(
    window.localStorage.getItem('ernie:disabled-plugins:v1'),
    '["ernie.browser"]',
  );
  await user.click(browserPluginSwitch);
  await user.click(within(pluginDialog).getByRole('button', { name: 'Close' }));
  await waitFor(() =>
    assert.equal(
      within(document.body).queryByRole('dialog', { name: 'Plugins' }),
      null,
    ),
  );
  assert.ok(
    await within(document.body).findByRole('button', { name: 'Browser' }),
  );
  assert.equal(
    window.localStorage.getItem('ernie:disabled-plugins:v1'),
    '[]',
  );
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
    within(document.body).getByRole('button', { name: 'Back to Agent' }),
  );
  assert.equal(
    within(document.body).queryByRole('button', {
      name: 'Application settings',
    }),
    null,
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
      assert.ok(
        within(
          within(document.body).getByRole('button', { name: 'kastuli' }),
        ).getByTitle('1 Agent working'),
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
  sessionFeed?.({
    activeSessionId: 'blank-agent',
    item: {
      kind: 'conversation-replaced',
      isStreaming: false,
      messages: [
        { id: 'stale-task', role: 'user', text: 'Injected stale task' },
        { id: 'stale-reply', role: 'assistant', text: 'Rejected event' },
      ],
      transcript: [
        {
          id: 'stale-task',
          kind: 'message',
          role: 'user',
          text: 'Injected stale task',
        },
        {
          id: 'stale-reply',
          kind: 'message',
          role: 'assistant',
          text: 'Rejected event',
        },
      ],
    },
    revision: 2,
    subscriptionId: 'retired-feed:blank-agent',
  });
  assert.equal(within(document.body).queryByText('Rejected event'), null);
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
  await user.click(
    within(document.body).getByRole('button', { name: 'Polish the sidebar' }),
  );
  assert.ok(within(document.body).getByText('Live event received.'));
  assert.equal(within(document.body).queryByText('Rejected event'), null);
  assert.ok(within(document.body).getByRole('button', { name: 'Depth 6' }));
  assert.equal(sessionFeedWatchCount, 2);
  assert.equal(
    within(document.body)
      .getByRole('button', { name: 'Polish the sidebar' })
      .getAttribute('aria-current'),
    'page',
  );
});
