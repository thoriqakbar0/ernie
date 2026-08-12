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
  readonly primeAgentConnection?: 'connecting' | 'ready' | 'unavailable';
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
          importingSessionPath={null}
          renamingSession={false}
          folders={folders}
          selectedCwd={overrides.selectedCwd ?? '/workspace/ernie'}
          selectedSessionId={overrides.selectedSessionId ?? 'ernie-agent'}
          sessionPreviews={overrides.sessionPreviews ?? {}}
          sessions={sessions}
          savedSessions={savedSessions}
          changeFolder={actions.changeFolder ?? (() => undefined)}
          addWorkspaceDirectory={async () =>
            (await actions.addRepository()) ?? null
          }
          startAgentDraft={actions.startAgentDraft}
          importSession={actions.importSession}
          renameSession={actions.renameSession}
          selectSession={actions.selectSession}
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
  assert.match(ernieRepository.textContent ?? '', /1 working/u);
  assert.equal(within(document.body).queryByLabelText('Working'), null);
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

  assert.ok(within(document.body).getByText('Spaces'));
  assert.equal(within(document.body).queryByText('Repositories'), null);

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
  assert.ok(within(document.body).getByText('Agent unavailable'));
  assert.doesNotMatch(
    within(document.body).getByRole('button', { name: 'ernie' }).textContent ?? '',
    /working/u,
  );
  assert.equal(within(document.body).queryByText(/needs input/u), null);
  await user.click(
    within(document.body).getByRole('button', {
      name: /Ernie Agent unavailable/u,
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

  await user.click(
    within(document.body).getByRole('button', { name: 'Search Agents' }),
  );
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

  await user.click(
    within(document.body).getByRole('button', {
      name: 'Manage Codebase rating feedback',
    }),
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

test('archived threads leave the sidebar without an archived section', async () => {
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
      name: 'Manage Codebase rating feedback',
    }),
  );
  await user.click(within(document.body).getByRole('menuitem', { name: 'Archive' }));

  assert.equal(
    within(document.body).queryByRole('button', {
      name: 'Codebase rating feedback',
    }),
    null,
  );
  assert.equal(within(document.body).queryByRole('button', { name: /Archived/u }), null);

  await user.click(within(document.body).getByRole('button', { name: 'Undo' }));
  assert.ok(
    within(document.body).getByRole('button', {
      name: 'Codebase rating feedback',
    }),
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
    ['Rename', 'Pin to top', 'Archive'],
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
      name: 'Manage Codebase rating feedback',
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
  assert.match(
    within(pinnedTasks).getByRole('button', {
      name: 'Codebase rating feedback',
    }).textContent ?? '',
    /ernie/u,
  );
  assert.equal(
    within(ernieRepository).queryByRole('button', {
      name: 'Codebase rating feedback',
    }),
    null,
  );

  await user.click(
    within(pinnedTasks).getByRole('button', {
      name: 'Manage Codebase rating feedback',
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
