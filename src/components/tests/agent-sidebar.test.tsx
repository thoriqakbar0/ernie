import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AgentSidebar } from '@/components/agent-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { PrimeAgentFolderChoice } from '@/hooks/use-prime-agent-workspace';
import type {
  PrimeAgentSavedSession,
  PrimeAgentSession,
  PrimeAgentSessionRename,
} from '@/packages/prime-agent-daemon/client';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

interface SidebarFixtureOverrides {
  readonly folders?: readonly PrimeAgentFolderChoice[];
  readonly importingSessionPath?: string | null;
  readonly primeAgentConnection?:
    | 'connecting'
    | 'ready'
    | 'reconnecting'
    | 'unavailable';
  readonly savedSessions?: readonly PrimeAgentSavedSession[];
  readonly sessionPreviews?: Readonly<Record<string, string>>;
  readonly selectedCwd?: string;
  readonly selectedSessionId?: string | null;
  readonly sessions?: readonly PrimeAgentSession[];
}

function renderSidebar(actions: {
  readonly addRepository: () => Promise<string | null> | string | null | void;
  readonly changeFolder?: (cwd: string | null) => void;
  readonly startAgentDraft: (cwd: string) => void;
  readonly importSession: (sessionPath: string) => void;
  readonly renameSession: (rename: PrimeAgentSessionRename) => void;
  readonly selectSession: (activeSessionId: string) => void;
}, overrides: SidebarFixtureOverrides = {}): void {
  const folders = overrides.folders ?? [
    {
      branchName: null,
      label: 'ernie',
      repositoryCwd: '/workspace/ernie',
      value: '/workspace/ernie',
    },
    {
      branchName: 'feature/calm-ui',
      label: 'calm-ui',
      repositoryCwd: '/workspace/ernie',
      value: '/workspace/ernie-worktrees/feature/calm-ui',
    },
    {
      branchName: null,
      label: 'kastuli',
      repositoryCwd: '/workspace/kastuli',
      value: '/workspace/kastuli',
    },
  ];
  const sessions = overrides.sessions ?? [
    {
      activeSessionId: 'ernie-agent',
      activity: 'working',
      cwd: '/workspace/ernie',
      modifiedAt: null,
      model: null,
      name: 'Codebase rating feedback',
      sessionPath: '/sessions/ernie-agent.jsonl',
    },
    {
      activeSessionId: 'general-agent',
      activity: 'idle',
      cwd: '/workspace/kastuli',
      modifiedAt: null,
      model: null,
      name: 'General chat',
      sessionPath: '/sessions/general-agent.jsonl',
    },
    {
      activeSessionId: 'worktree-agent',
      activity: 'needs_input',
      cwd: '/workspace/ernie-worktrees/feature/calm-ui',
      modifiedAt: null,
      model: null,
      name: 'Calm worktree task',
      sessionPath: '/sessions/worktree-agent.jsonl',
    },
  ] satisfies readonly PrimeAgentSession[];
  const savedSessions = overrides.savedSessions ?? [
    {
      activity: 'settled',
      cwd: '/workspace/ernie',
      messageCount: 12,
      modifiedAt: '2026-08-10T10:00:00.000Z',
      name: 'Saved architecture review',
      path: '/sessions/saved-architecture.jsonl',
    },
  ] satisfies readonly PrimeAgentSavedSession[];

  render(
    <TooltipProvider>
      <SidebarProvider>
        <AgentSidebar
          creatingAgent={false}
          primeAgentConnection={overrides.primeAgentConnection ?? 'ready'}
          importingSessionPath={overrides.importingSessionPath ?? null}
          renamingSession={false}
          folders={folders}
          selectedCwd={overrides.selectedCwd ?? '/workspace/ernie'}
          selectedSessionId={
            overrides.selectedSessionId === undefined
              ? 'ernie-agent'
              : overrides.selectedSessionId
          }
          sessionPreviews={overrides.sessionPreviews ?? {}}
          sessions={sessions}
          savedSessions={savedSessions}
          changeFolder={actions.changeFolder ?? (() => undefined)}
          addWorkspaceDirectory={async () =>
            (await actions.addRepository()) ?? null
          }
          startAgentDraft={actions.startAgentDraft}
          importSession={actions.importSession}
          onOpenSettings={() => undefined}
          renameSession={actions.renameSession}
          selectSession={actions.selectSession}
          settingsOpen={false}
        />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

test('live Agent rows preview the latest user message', () => {
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    {
      sessionPreviews: {
        'ernie-agent': 'Review the empty state next',
      },
    },
  );

  assert.ok(
    within(document.body).getByRole('button', {
      name: 'Review the empty state next',
    }),
  );
});

test('user can select a nested Agent conversation', async () => {
  const selectedSessions: string[] = [];
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: (activeSessionId) => selectedSessions.push(activeSessionId),
  });

  await user.click(within(document.body).getByRole('button', { name: 'kastuli' }));
  await user.click(
    within(document.body).getByRole('button', { name: 'General chat' }),
  );

  assert.deepEqual(selectedSessions, ['general-agent']);
});

test('space remains selectable while folding and unfolding its Agent list', async () => {
  const changedFolders: Array<string | null> = [];
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    changeFolder: (cwd) => changedFolders.push(cwd),
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  const ernieRepository = within(document.body).getByRole('listitem', {
    name: 'ernie repository',
  });
  const repositoryButton = within(ernieRepository).getByRole('button', {
    name: 'ernie',
  });

  assert.equal(repositoryButton.getAttribute('aria-expanded'), 'true');
  assert.ok(
    within(ernieRepository).getByRole('button', {
      name: 'Codebase rating feedback',
    }),
  );

  await user.click(repositoryButton);

  assert.equal(repositoryButton.getAttribute('aria-expanded'), 'false');
  assert.equal(
    within(ernieRepository).queryByRole('button', {
      name: 'Codebase rating feedback',
    }),
    null,
  );
  assert.deepEqual(changedFolders, ['/workspace/ernie']);

  await user.click(repositoryButton);

  assert.equal(repositoryButton.getAttribute('aria-expanded'), 'true');
  assert.ok(
    within(ernieRepository).getByRole('button', {
      name: 'Codebase rating feedback',
    }),
  );
  assert.deepEqual(changedFolders, [
    '/workspace/ernie',
    '/workspace/ernie',
  ]);
});

test('selecting a space changes the composer workspace and folds the previous space', async () => {
  const changedFolders: Array<string | null> = [];
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    changeFolder: (cwd) => changedFolders.push(cwd),
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  const ernie = within(document.body).getByRole('button', { name: 'ernie' });
  const kastuli = within(document.body).getByRole('button', { name: 'kastuli' });
  await user.click(kastuli);

  assert.equal(ernie.getAttribute('aria-expanded'), 'false');
  assert.equal(kastuli.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(changedFolders, ['/workspace/kastuli']);
});

test('only the plus action starts a draft without changing the tree', async () => {
  const draftCwds: string[] = [];
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: (cwd) => draftCwds.push(cwd),
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  const ernieRepository = within(document.body).getByRole('listitem', {
    name: 'ernie repository',
  });
  const repositoryButton = within(ernieRepository).getByRole('button', {
    name: 'ernie',
  });
  await user.click(repositoryButton);
  await user.click(
    within(ernieRepository).getByRole('button', {
      name: 'New Agent in ernie',
    }),
  );

  assert.deepEqual(draftCwds, ['/workspace/ernie']);
  assert.equal(repositoryButton.getAttribute('aria-expanded'), 'false');
});

test('linked Git worktrees nest inside their repository', () => {
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  assert.equal(
    within(document.body).queryByRole('listitem', {
      name: 'calm-ui repository',
    }),
    null,
  );
  const ernieRepository = within(document.body).getByRole('listitem', {
    name: 'ernie repository',
  });
  const worktree = within(ernieRepository).getByRole('listitem', {
    name: 'feature/calm-ui worktree',
  });
  assert.equal(
    within(worktree).queryByRole('button', { name: 'Worktree feature/calm-ui' }),
    null,
  );
  assert.ok(within(worktree).getByRole('button', { name: 'Calm worktree task' }));
  assert.ok(
    within(worktree).getByRole('button', {
      name: 'New Agent in feature/calm-ui',
    }),
  );
});

test('branch labels receive stable distinct colors', () => {
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    {
      folders: [
        {
          branchName: null,
          label: 'ernie',
          repositoryCwd: '/workspace/ernie',
          value: '/workspace/ernie',
        },
        {
          branchName: 'feat/better-visual-for-chat',
          label: 'better-visual-for-chat',
          repositoryCwd: '/workspace/ernie',
          value: '/workspace/better-visual-for-chat',
        },
        {
          branchName: 'fix/sidebar-color',
          label: 'sidebar-color',
          repositoryCwd: '/workspace/ernie',
          value: '/workspace/sidebar-color',
        },
      ],
      sessions: [
        {
          activeSessionId: 'visual-agent',
          activity: 'idle',
          cwd: '/workspace/better-visual-for-chat',
          modifiedAt: null,
          model: null,
          name: 'Improve chat visuals',
          sessionPath: '/sessions/visual-agent.jsonl',
        },
        {
          activeSessionId: 'color-agent',
          activity: 'idle',
          cwd: '/workspace/sidebar-color',
          modifiedAt: null,
          model: null,
          name: 'Color branch labels',
          sessionPath: '/sessions/color-agent.jsonl',
        },
      ],
    },
  );

  const visualBranch = within(document.body).getByTitle(
    'feat/better-visual-for-chat',
  );
  const colorBranch = within(document.body).getByTitle('fix/sidebar-color');

  assert.match(visualBranch.className, /\btext-amber-700\b/u);
  assert.match(visualBranch.className, /\bdark:text-amber-300\b/u);
  assert.match(visualBranch.className, /\bfont-mono\b/u);
  assert.match(colorBranch.className, /\btext-blue-700\b/u);
  assert.match(colorBranch.className, /\bdark:text-blue-300\b/u);
});

test('selected Agent is the only active row in its repository', () => {
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  const repository = within(document.body).getByRole('button', {
    name: 'ernie',
  });
  const agent = within(document.body).getByRole('button', {
    name: 'Codebase rating feedback',
  });

  assert.doesNotMatch(repository.className, /\bbg-sidebar-accent\/60\b/u);
  assert.match(repository.className, /\baria-expanded:bg-transparent\b/u);
  assert.doesNotMatch(repository.className, /\baria-expanded:bg-muted\b/u);
  assert.equal(repository.getAttribute('data-active'), 'false');
  assert.equal(agent.getAttribute('data-active'), 'true');
  assert.match(agent.className, /\bbg-sidebar-accent\b/u);
  assert.doesNotMatch(agent.className, /\bborder-s-2\b/u);
});

test('Agent rows reserve one stable trailing status column', () => {
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  const working = within(document.body).getByRole('button', {
    name: 'Codebase rating feedback',
  });
  const needsInput = within(document.body).getByRole('button', {
    name: 'Calm worktree task',
  });
  assert.match(working.className, /\bpe-14\b/u);
  assert.ok(within(working.parentElement ?? document.body).getByLabelText('Working'));
  assert.ok(
    within(needsInput.parentElement ?? document.body).getByLabelText(
      'Needs input',
    ),
  );
  assert.equal(
    within(needsInput.parentElement ?? document.body).queryByTitle(
      'Needs input',
    )?.className.includes('amber'),
    false,
  );
});

test('selected Agent is the only active row in its worktree', () => {
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    {
      selectedCwd: '/workspace/ernie-worktrees/feature/calm-ui',
      selectedSessionId: 'worktree-agent',
    },
  );

  const worktree = within(document.body).getByRole('listitem', {
    name: 'feature/calm-ui worktree',
  });
  const worktreeHeader = within(worktree).getByTitle('feature/calm-ui').parentElement;
  const agent = within(worktree).getByRole('button', {
    name: 'Calm worktree task',
  });

  assert.notEqual(worktreeHeader, null);
  if (worktreeHeader === null) return;
  assert.doesNotMatch(worktreeHeader.className, /\bbg-sidebar-accent\/60\b/u);
  assert.equal(worktreeHeader.getAttribute('data-active'), 'false');
  assert.equal(agent.getAttribute('data-active'), 'true');
});

test('repository owns the active row when no Agent is selected', () => {
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    { selectedSessionId: null },
  );

  const repository = within(document.body).getByRole('button', {
    name: 'ernie',
  });
  const agent = within(document.body).getByRole('button', {
    name: 'Codebase rating feedback',
  });

  assert.equal(repository.getAttribute('data-active'), 'true');
  assert.match(repository.className, /\bbg-sidebar-accent\/60\b/u);
  assert.equal(agent.getAttribute('data-active'), 'false');
});

test('sidebar hides empty pin furniture and counts only working Agents', () => {
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  assert.equal(
    within(document.body).queryByRole('region', { name: 'Pinned tasks' }),
    null,
  );
  const ernieRepository = within(document.body).getByRole('button', {
    name: 'ernie',
  });
  assert.ok(within(ernieRepository).getByTitle('1 Agent working'));
  const workingThread = within(document.body).getByRole('button', {
    name: 'Codebase rating feedback',
  });
  assert.equal(workingThread.getAttribute('aria-description'), 'working');
  assert.ok(
    within(workingThread.parentElement ?? document.body).getByLabelText(
      'Working',
    ),
  );
});

test('settled spaces stay quiet', () => {
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    {
      folders: [
        {
          branchName: null,
          label: 'leslie',
          repositoryCwd: '/workspace/leslie',
          value: '/workspace/leslie',
        },
      ],
      savedSessions: [],
      selectedCwd: '/workspace/leslie',
      selectedSessionId: 'leslie-agent',
      sessions: [
        {
          activeSessionId: 'leslie-agent',
          activity: 'settled',
          cwd: '/workspace/leslie',
          modifiedAt: null,
          model: null,
          name: 'Build Leslie creative assets',
          sessionPath: '/sessions/leslie-agent.jsonl',
        },
      ],
    },
  );

  const repository = within(document.body).getByRole('listitem', {
    name: 'leslie repository',
  });
  assert.equal(within(repository).queryByText(/needs input/u), null);
  assert.doesNotMatch(repository.textContent ?? '', /working/u);
});

test('Agents are grouped by truthful status without an active filter', () => {
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  assert.ok(within(document.body).getAllByText(/needs input/u).length > 0);
  assert.equal(
    within(document.body).queryByRole('button', { name: 'Show active Agents' }),
    null,
  );
  const ernie = within(document.body).getByRole('listitem', {
    name: 'ernie repository',
  });
  const agentNames = within(ernie)
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
    .filter((label) =>
      ['Codebase rating feedback', 'Saved architecture review, saved session'].includes(
        label ?? '',
      ),
    );
  assert.deepEqual(agentNames, [
    'Codebase rating feedback',
    'Saved architecture review, saved session',
  ]);
});

test('idle Agent needs input only after unseen output arrives', async () => {
  window.localStorage.setItem(
    'ernie:thread-management:v1',
    JSON.stringify({
      archivedThreadIds: [],
      lastViewedAtByThread: {
        'session:/sessions/unseen-agent.jsonl': '2026-08-13T02:00:00.000Z',
      },
      orderByRepository: {},
    }),
  );
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    {
      savedSessions: [],
      selectedSessionId: null,
      sessions: [
        {
          activeSessionId: 'unseen-agent',
          activity: 'idle',
          cwd: '/workspace/ernie',
          modifiedAt: '2026-08-13T02:01:00.000Z',
          model: null,
          name: 'Unseen Agent output',
          sessionPath: '/sessions/unseen-agent.jsonl',
        },
      ],
    },
  );

  await waitFor(() => {
    assert.equal(
      within(document.body)
        .getByRole('button', { name: 'Unseen Agent output' })
        .getAttribute('aria-description'),
      'needs input',
    );
  });
});

test('viewing an Agent clears its unseen-output attention', async () => {
  window.localStorage.setItem(
    'ernie:thread-management:v1',
    JSON.stringify({
      archivedThreadIds: [],
      lastViewedAtByThread: {
        'session:/sessions/viewed-agent.jsonl': '2026-08-13T02:00:00.000Z',
      },
      orderByRepository: {},
    }),
  );
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    {
      savedSessions: [],
      selectedSessionId: 'viewed-agent',
      sessions: [
        {
          activeSessionId: 'viewed-agent',
          activity: 'idle',
          cwd: '/workspace/ernie',
          modifiedAt: '2026-08-13T02:01:00.000Z',
          model: null,
          name: 'Viewed Agent output',
          sessionPath: '/sessions/viewed-agent.jsonl',
        },
      ],
    },
  );

  await waitFor(() => {
    assert.equal(
      within(document.body)
        .getByRole('button', { name: 'Viewed Agent output' })
        .getAttribute('aria-description'),
      null,
    );
  });
});

test('live status changes do not reorder Agent rows', () => {
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    {
      savedSessions: [],
      sessions: [
        {
          activeSessionId: 'needs-input-agent',
          activity: 'needs_input',
          cwd: '/workspace/ernie',
          modifiedAt: null,
          model: null,
          name: 'First Agent',
          sessionPath: '/sessions/needs-input-agent.jsonl',
        },
        {
          activeSessionId: 'working-agent',
          activity: 'working',
          cwd: '/workspace/ernie',
          modifiedAt: null,
          model: null,
          name: 'Second Agent',
          sessionPath: '/sessions/working-agent.jsonl',
        },
      ],
    },
  );

  const repository = within(document.body).getByRole('listitem', {
    name: 'ernie repository',
  });
  const threadLabels = within(repository)
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
    .filter((label) => label === 'First Agent' || label === 'Second Agent');

  assert.deepEqual(threadLabels, ['First Agent', 'Second Agent']);
});

test('needs-input summaries stay compact without losing their meaning', () => {
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  const summaries = within(document.body).getAllByTitle('1 Agent needs input');
  assert.equal(summaries.length, 2);
  for (const summary of summaries) {
    assert.equal(summary.textContent, '1 Agent needs input');
    assert.equal(summary.querySelector('[aria-hidden="true"]') !== null, true);
  }
});

test('user can add a repository and start a local Agent draft inside one', async () => {
  let repositoryRequests = 0;
  const draftCwds: string[] = [];
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => {
      repositoryRequests += 1;
    },
    startAgentDraft: (cwd) => draftCwds.push(cwd),
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  assert.ok(within(document.body).getByText('Repositories'));
  assert.equal(within(document.body).queryByText('Spaces'), null);

  await user.click(
    within(document.body).getByRole('button', { name: 'Add repository' }),
  );
  await user.click(
    within(document.body).getByRole('button', {
      name: 'New Agent in ernie',
    }),
  );

  assert.equal(repositoryRequests, 1);
  assert.deepEqual(draftCwds, ['/workspace/ernie']);
});

test('sidebar omits the standalone session import action', () => {
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  assert.equal(
    within(document.body).queryByRole('button', {
      name: 'Import Prime Agent session',
    }),
    null,
  );
});

test('ready footer stays quiet while unavailable state reveals recovery details', async () => {
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  assert.equal(within(document.body).queryByText('Prime Agent ready'), null);
  assert.ok(within(document.body).getByText('Ernie'));

  cleanup();
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    { primeAgentConnection: 'unavailable' },
  );
  assert.ok(within(document.body).getByText('Prime Agent unavailable'));
  assert.doesNotMatch(
    within(document.body).getByRole('button', { name: 'ernie' }).textContent ?? '',
    /working/u,
  );
  assert.equal(within(document.body).queryByText(/needs input/u), null);
  await user.click(
    within(document.body).getByRole('button', {
      name: /Ernie Prime Agent unavailable/u,
    }),
  );
  assert.ok(
    within(document.body).getByText(
      'Ernie could not reach Prime Agent. Restart Ernie, then try again.',
    ),
  );
});

test('shows three recent settled Agents and discloses only the hidden remainder', async () => {
  const user = userEvent.setup();
  const savedSessions = Array.from({ length: 5 }, (_, index) => ({
    activity: 'settled' as const,
    cwd: '/workspace/ernie',
    messageCount: 1,
    modifiedAt: `2026-08-${String(10 - index).padStart(2, '0')}T10:00:00.000Z`,
    name: `Settled ${index + 1}`,
    path: `/sessions/settled-${index + 1}.jsonl`,
  }));
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    { savedSessions },
  );

  assert.ok(
    within(document.body).getByRole('button', {
      name: 'Settled 1, saved session',
    }),
  );
  assert.ok(
    within(document.body).getByRole('button', {
      name: 'Settled 3, saved session',
    }),
  );
  assert.equal(
    within(document.body).queryByRole('button', {
      name: 'Settled 4, saved session',
    }),
    null,
  );
  await user.click(
    within(document.body).getByRole('button', { name: 'Settled (2)' }),
  );
  assert.ok(
    within(document.body).getByRole('button', {
      name: 'Settled 5, saved session',
    }),
  );
  assert.ok(within(document.body).getByRole('button', { name: 'Hide settled' }));
});

test('Control+O reveals every hidden thread group', () => {
  const savedSessions = Array.from({ length: 5 }, (_, index) => ({
    activity: 'settled' as const,
    cwd: '/workspace/ernie',
    messageCount: 1,
    modifiedAt: `2026-08-${String(10 - index).padStart(2, '0')}T10:00:00.000Z`,
    name: `Open all ${index + 1}`,
    path: `/sessions/open-all-${index + 1}.jsonl`,
  }));
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    { savedSessions },
  );
  assert.equal(
    within(document.body).queryByRole('button', {
      name: 'Open all 5, saved session',
    }),
    null,
  );

  fireEvent.keyDown(window, { key: 'o', ctrlKey: true });

  assert.ok(
    within(document.body).getByRole('button', {
      name: 'Open all 5, saved session',
    }),
  );
});

test('compact search finds hidden settled Agents and restores the tree after opening', async () => {
  const importedPaths: string[] = [];
  const user = userEvent.setup();
  const savedSessions = Array.from({ length: 4 }, (_, index) => ({
    activity: 'settled' as const,
    cwd: '/workspace/ernie',
    messageCount: 1,
    modifiedAt: `2026-08-${String(10 - index).padStart(2, '0')}T10:00:00.000Z`,
    name: index === 3 ? 'Buried architecture' : `Recent ${index + 1}`,
    path: `/sessions/search-${index + 1}.jsonl`,
  }));
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: (path) => importedPaths.push(path),
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    { savedSessions },
  );

  assert.equal(
    within(document.body).queryByRole('button', { name: 'Search Agents' }),
    null,
  );
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
  const search = within(document.body).getByRole('searchbox', {
    name: 'Search repositories, worktrees, and Agents',
  });
  await user.type(search, 'buried');
  await user.click(
    within(document.body).getByRole('button', {
      name: 'Buried architecture, saved session',
    }),
  );

  assert.deepEqual(importedPaths, ['/sessions/search-4.jsonl']);
  assert.equal(
    within(document.body).queryByRole('searchbox', {
      name: 'Search repositories, worktrees, and Agents',
    }),
    null,
  );
  assert.equal(
    within(document.body).queryByRole('button', {
      name: /Buried architecture/u,
    }),
    null,
  );
});

test('saved conversations appear inside their repository and open in place', async () => {
  const importedPaths: string[] = [];
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: (sessionPath) => importedPaths.push(sessionPath),
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  const ernieRepository = within(document.body).getByRole('listitem', {
    name: 'ernie repository',
  });
  await user.click(
    within(ernieRepository).getByRole('button', {
      name: 'Saved architecture review, saved session',
    }),
  );

  assert.deepEqual(importedPaths, ['/sessions/saved-architecture.jsonl']);
});

test('pending saved conversation owns the active row state', () => {
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    { importingSessionPath: '/sessions/saved-architecture.jsonl' },
  );

  const previous = within(document.body).getByRole('button', {
    name: 'Codebase rating feedback',
  });
  const pending = within(document.body).getByRole('button', {
    name: 'Saved architecture review, saved session',
  });

  assert.equal(previous.getAttribute('data-active'), 'false');
  assert.equal(previous.getAttribute('aria-current'), null);
  assert.equal(pending.getAttribute('data-active'), 'true');
  assert.equal(pending.getAttribute('aria-current'), 'page');
});

test('user can rename a thread from its Trove menu', async () => {
  const renames: PrimeAgentSessionRename[] = [];
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: (rename) => renames.push(rename),
    selectSession: () => undefined,
  });

  assert.equal(document.querySelector('.lucide-grip-vertical'), null);
  const actions = within(document.body).getByRole('button', {
    name: 'More actions for Codebase rating feedback',
  });
  assert.match(actions.className, /opacity-100/u);
  await user.click(
    actions,
  );
  await user.click(within(document.body).getByRole('menuitem', { name: 'Rename' }));
  const input = within(document.body).getByRole('textbox', {
    name: 'Conversation name',
  });
  await user.clear(input);
  await user.type(input, 'Thread management polish');
  await user.click(within(document.body).getByRole('button', { name: 'Rename' }));

  assert.deepEqual(renames, [
    {
      kind: 'live',
      activeSessionId: 'ernie-agent',
      sessionPath: '/sessions/ernie-agent.jsonl',
      name: 'Thread management polish',
    },
  ]);
});

test('archived threads remain recoverable from undo and the archive', async () => {
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  await user.click(
    within(document.body).getByRole('button', {
      name: 'More actions for Codebase rating feedback',
    }),
  );
  await user.click(within(document.body).getByRole('menuitem', { name: 'Archive' }));

  assert.equal(
    within(document.body).queryByRole('button', {
      name: 'Codebase rating feedback',
    }),
    null,
  );
  const archiveStatus = within(document.body).getByRole('status');
  assert.match(archiveStatus.className, /\babsolute\b/u);
  assert.match(archiveStatus.className, /\binset-x-3\b/u);
  assert.doesNotMatch(archiveStatus.className, /\bfixed\b/u);
  assert.doesNotMatch(archiveStatus.className, /\bw-64\b/u);
  const archive = within(document.body).getByRole('region', {
    name: 'Archived sidebar items',
  });
  await user.click(within(archive).getByRole('button', { name: 'Archived (1)' }));
  assert.ok(
    within(archive).getByRole('button', {
      name: 'Codebase rating feedback',
    }),
  );

  await user.click(within(document.body).getByRole('button', { name: 'Undo' }));
  assert.ok(
    within(document.body).getByRole('button', {
      name: 'Codebase rating feedback',
    }),
  );
});

test('archiving the last visible Agent removes its empty worktree', async () => {
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  await user.click(
    within(document.body).getByRole('button', {
      name: 'More actions for Calm worktree task',
    }),
  );
  await user.click(within(document.body).getByRole('menuitem', { name: 'Archive' }));

  assert.equal(
    within(document.body).queryByRole('listitem', {
      name: 'feature/calm-ui worktree',
    }),
    null,
  );
});

test('thread action menu provides keyboard-accessible reordering', async () => {
  const user = userEvent.setup();
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    {
      sessions: [
        {
          activeSessionId: 'ernie-agent',
          activity: 'idle',
          cwd: '/workspace/ernie',
          modifiedAt: null,
          model: null,
          name: 'Codebase rating feedback',
          sessionPath: '/sessions/ernie-agent.jsonl',
        },
      ],
      savedSessions: [
        {
          activity: 'idle',
          cwd: '/workspace/ernie',
          messageCount: 12,
          modifiedAt: '2026-08-10T10:00:00.000Z',
          name: 'Saved architecture review',
          path: '/sessions/saved-architecture.jsonl',
        },
      ],
    },
  );

  const actions = within(document.body).getByRole('button', {
    name: 'More actions for Saved architecture review',
  });
  actions.focus();
  await user.keyboard('{Enter}');
  const moveUp = within(document.body).getByRole('menuitem', { name: 'Move up' });
  moveUp.focus();
  await user.keyboard('{Enter}');

  const repository = within(document.body).getByRole('listitem', {
    name: 'ernie repository',
  });
  const threadButtons = within(repository)
    .getAllByRole('button')
    .filter((button) =>
      ['Codebase rating feedback', 'Saved architecture review, saved session'].includes(
        button.getAttribute('aria-label') ?? '',
      ),
    );
  assert.deepEqual(
    threadButtons.map((button) => button.getAttribute('aria-label')),
    ['Saved architecture review, saved session', 'Codebase rating feedback'],
  );
});

test('user can reorder Agents inside one status group', () => {
  renderSidebar(
    {
      addRepository: () => undefined,
      startAgentDraft: () => undefined,
      importSession: () => undefined,
      renameSession: () => undefined,
      selectSession: () => undefined,
    },
    {
      sessions: [
        {
          activeSessionId: 'ernie-agent',
          activity: 'idle',
          cwd: '/workspace/ernie',
          modifiedAt: null,
          model: null,
          name: 'Codebase rating feedback',
          sessionPath: '/sessions/ernie-agent.jsonl',
        },
      ],
      savedSessions: [
        {
          activity: 'idle',
          cwd: '/workspace/ernie',
          messageCount: 12,
          modifiedAt: '2026-08-10T10:00:00.000Z',
          name: 'Saved architecture review',
          path: '/sessions/saved-architecture.jsonl',
        },
      ],
    },
  );
  const repository = within(document.body).getByRole('listitem', {
    name: 'ernie repository',
  });
  const live = within(repository).getByRole('button', {
    name: 'Codebase rating feedback',
  });
  const saved = within(repository).getByRole('button', {
    name: 'Saved architecture review, saved session',
  });
  const dataTransfer = {
    dropEffect: 'none',
    effectAllowed: 'none',
    setData: () => undefined,
  };
  const savedRow = saved.closest('li');
  const liveRow = live.closest('li');
  assert.ok(savedRow);
  assert.ok(liveRow);

  fireEvent.dragStart(savedRow, { dataTransfer });
  fireEvent.dragOver(liveRow, { dataTransfer });
  fireEvent.drop(liveRow, { dataTransfer });

  const threadButtons = within(repository)
    .getAllByRole('button')
    .filter((button) =>
      ['Codebase rating feedback', 'Saved architecture review, saved session'].includes(
        button.getAttribute('aria-label') ?? '',
      ),
    );
  assert.deepEqual(
    threadButtons.map((button) => button.getAttribute('aria-label')),
    ['Saved architecture review, saved session', 'Codebase rating feedback'],
  );
});

test('thread actions open from a right-click context menu', () => {
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });
  const thread = within(document.body).getByRole('button', {
    name: 'Codebase rating feedback',
  });

  fireEvent.contextMenu(thread);

  assert.ok(within(document.body).getByRole('menuitem', { name: 'Rename' }));
  assert.ok(
    within(document.body).getByRole('menuitem', { name: 'Pin to top' }),
  );
  assert.ok(within(document.body).getByRole('menuitem', { name: 'Archive' }));
  assert.deepEqual(
    within(document.body)
      .getAllByRole('menuitem')
      .map((item) => item.textContent?.trim()),
    ['Rename', 'Pin to top', 'Move down', 'Archive'],
  );
});

test('worktree context menu archives and restores the branch in the sidebar', async () => {
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });
  const worktree = within(document.body).getByRole('listitem', {
    name: 'feature/calm-ui worktree',
  });
  const trigger = worktree.querySelector('[data-slot="context-menu-trigger"]');
  assert.ok(trigger);

  fireEvent.contextMenu(trigger);
  await user.click(
    within(document.body).getByRole('menuitem', { name: 'Archive branch' }),
  );

  assert.equal(
    within(document.body).queryByRole('listitem', {
      name: 'feature/calm-ui worktree',
    }),
    null,
  );
  await user.click(
    within(document.body).getByRole('button', { name: 'Archived (1)' }),
  );
  await user.click(
    within(document.body).getByRole('button', {
      name: 'Restore feature/calm-ui branch',
    }),
  );
  assert.ok(
    within(document.body).getByRole('listitem', {
      name: 'feature/calm-ui worktree',
    }),
  );
});

test('repository context menu renames the display label only', async () => {
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });
  fireEvent.contextMenu(
    within(document.body).getByRole('button', { name: 'ernie' }),
  );
  await user.click(
    within(document.body).getByRole('menuitem', {
      name: 'Rename display label',
    }),
  );
  const input = within(document.body).getByRole('textbox', {
    name: 'Repository label',
  });
  await user.clear(input);
  await user.type(input, 'Ernie app');
  await user.click(within(document.body).getByRole('button', { name: 'Rename' }));

  assert.ok(within(document.body).getByRole('button', { name: 'Ernie app' }));
  assert.equal(
    within(document.body).queryByRole('button', { name: 'ernie' }),
    null,
  );
});

test('removing a repository is non-destructive and re-adding restores it', async () => {
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => '/workspace/kastuli',
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });
  fireEvent.contextMenu(
    within(document.body).getByRole('button', { name: 'kastuli' }),
  );
  await user.click(
    within(document.body).getByRole('menuitem', {
      name: 'Remove from sidebar',
    }),
  );
  assert.ok(
    within(document.body).getByText(
      'This only removes it from the sidebar. Files, Git worktrees, and Agents stay untouched.',
    ),
  );
  await user.click(within(document.body).getByRole('button', { name: 'Remove' }));
  assert.equal(
    within(document.body).queryByRole('button', { name: 'kastuli' }),
    null,
  );

  await user.click(
    within(document.body).getByRole('button', { name: 'Add repository' }),
  );
  await waitFor(() =>
    assert.ok(within(document.body).getByRole('button', { name: 'kastuli' })),
  );
  assert.equal(
    within(document.body)
      .getByRole('button', { name: 'kastuli' })
      .getAttribute('aria-expanded'),
    'true',
  );
});

test('dropping a thread on the temporary pin target lifts it globally', () => {
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });
  const thread = within(document.body).getByRole('button', {
    name: 'Codebase rating feedback',
  });
  const threadRow = thread.closest('li');
  assert.ok(threadRow);
  const dataTransfer = {
    dropEffect: 'none',
    effectAllowed: 'none',
    setData: () => undefined,
  };

  fireEvent.dragStart(threadRow, { dataTransfer });
  const pinTarget = within(document.body).getByRole('region', {
    name: 'Pinned tasks',
  });
  fireEvent.dragOver(pinTarget, { dataTransfer });
  fireEvent.drop(pinTarget, { dataTransfer });

  assert.ok(
    within(pinTarget).getByRole('button', {
      name: 'Codebase rating feedback',
    }),
  );
});

test('pinned threads lift above repositories and return when unpinned', async () => {
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    startAgentDraft: () => undefined,
    importSession: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  const ernieRepository = within(document.body).getByRole('listitem', {
    name: 'ernie repository',
  });
  await user.click(
    within(ernieRepository).getByRole('button', {
      name: 'More actions for Codebase rating feedback',
    }),
  );
  await user.click(
    within(document.body).getByRole('menuitem', { name: 'Pin to top' }),
  );

  const pinnedTasks = within(document.body).getByRole('region', {
    name: 'Pinned tasks',
  });
  assert.ok(
    within(pinnedTasks).getByRole('button', {
      name: 'Codebase rating feedback',
    }),
  );
  assert.equal(
    within(pinnedTasks)
      .getByRole('button', {
        name: 'Codebase rating feedback',
      })
      .getAttribute('title'),
    'Codebase rating feedback · ernie',
  );
  assert.equal(
    within(ernieRepository).queryByRole('button', {
      name: 'Codebase rating feedback',
    }),
    null,
  );

  await user.click(
    within(pinnedTasks).getByRole('button', {
      name: 'More actions for Codebase rating feedback',
    }),
  );
  await user.click(
    within(document.body).getByRole('menuitem', { name: 'Unpin' }),
  );

  assert.equal(
    within(document.body).queryByRole('region', { name: 'Pinned tasks' }),
    null,
  );
  assert.ok(
    within(ernieRepository).getByRole('button', {
      name: 'Codebase rating feedback',
    }),
  );
});
