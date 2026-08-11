import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AgentSidebar } from '@/components/agent-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { PrimeAgentSessionRename } from '@/packages/prime-agent-daemon/client';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderSidebar(actions: {
  readonly addRepository: () => void;
  readonly prepareAgent: (cwd: string) => void;
  readonly importSession: (sessionPath: string) => void;
  readonly loadSavedSessions: () => void;
  readonly renameSession: (rename: PrimeAgentSessionRename) => void;
  readonly selectSession: (activeSessionId: string) => void;
}): void {
  render(
    <TooltipProvider>
      <SidebarProvider>
        <AgentSidebar
          creatingAgent={false}
          importingSessionPath={null}
          loadingSavedSessions={false}
          renamingSession={false}
          folders={[
            { label: 'ernie', value: '/workspace/ernie' },
            { label: 'kastuli', value: '/workspace/kastuli' },
          ]}
          selectedCwd="/workspace/ernie"
          selectedSessionId="ernie-agent"
          sessions={[
            {
              activeSessionId: 'ernie-agent',
              cwd: '/workspace/ernie',
              modifiedAt: null,
              model: null,
              name: 'Codebase rating feedback',
              sessionPath: '/sessions/ernie-agent.jsonl',
            },
            {
              activeSessionId: 'general-agent',
              cwd: '/workspace/kastuli',
              modifiedAt: null,
              model: null,
              name: 'General chat',
              sessionPath: '/sessions/general-agent.jsonl',
            },
          ]}
          savedSessions={[
            {
              cwd: '/workspace/ernie',
              messageCount: 12,
              modifiedAt: '2026-08-10T10:00:00.000Z',
              name: 'Saved architecture review',
              path: '/sessions/saved-architecture.jsonl',
            },
          ]}
          changeFolder={() => undefined}
          chooseWorkspaceDirectory={actions.addRepository}
          prepareAgent={actions.prepareAgent}
          importSession={actions.importSession}
          loadSavedSessions={actions.loadSavedSessions}
          renameSession={actions.renameSession}
          selectSession={actions.selectSession}
        />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

test('user can select a nested Agent conversation', async () => {
  const selectedSessions: string[] = [];
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    prepareAgent: () => undefined,
    importSession: () => undefined,
    loadSavedSessions: () => undefined,
    renameSession: () => undefined,
    selectSession: (activeSessionId) => selectedSessions.push(activeSessionId),
  });

  await user.click(
    within(document.body).getByRole('button', { name: 'General chat' }),
  );

  assert.deepEqual(selectedSessions, ['general-agent']);
});

test('user can fold and unfold a repository conversation list', async () => {
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    prepareAgent: () => undefined,
    importSession: () => undefined,
    loadSavedSessions: () => undefined,
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

  await user.click(repositoryButton);

  assert.equal(repositoryButton.getAttribute('aria-expanded'), 'true');
  assert.ok(
    within(ernieRepository).getByRole('button', {
      name: 'Codebase rating feedback',
    }),
  );
});

test('user can add a repository and prepare an Agent draft inside one', async () => {
  let repositoryRequests = 0;
  const draftCwds: string[] = [];
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => {
      repositoryRequests += 1;
    },
    prepareAgent: (cwd) => draftCwds.push(cwd),
    importSession: () => undefined,
    loadSavedSessions: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  await user.click(
    within(document.body).getByRole('button', { name: 'Add repository' }),
  );
  await user.click(
    within(document.body).getByRole('button', {
      name: 'New draft in ernie',
    }),
  );

  assert.equal(repositoryRequests, 1);
  assert.deepEqual(draftCwds, ['/workspace/ernie']);
});

test('user can import a saved Prime Agent session', async () => {
  let loadRequests = 0;
  const importedPaths: string[] = [];
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    prepareAgent: () => undefined,
    importSession: (sessionPath) => importedPaths.push(sessionPath),
    loadSavedSessions: () => {
      loadRequests += 1;
    },
    renameSession: () => undefined,
    selectSession: () => undefined,
  });

  await user.click(
    within(document.body).getByRole('button', {
      name: 'Import Prime Agent session',
    }),
  );
  await user.click(
    within(document.body).getByRole('button', {
      name: /Saved architecture review/u,
    }),
  );

  assert.equal(loadRequests, 1);
  assert.deepEqual(importedPaths, ['/sessions/saved-architecture.jsonl']);
});

test('saved conversations appear inside their repository and open in place', async () => {
  const importedPaths: string[] = [];
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    prepareAgent: () => undefined,
    importSession: (sessionPath) => importedPaths.push(sessionPath),
    loadSavedSessions: () => undefined,
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
    prepareAgent: () => undefined,
    importSession: () => undefined,
    loadSavedSessions: () => undefined,
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
    prepareAgent: () => undefined,
    importSession: () => undefined,
    loadSavedSessions: () => undefined,
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
});

test('user can reorder threads by dragging one row onto another', () => {
  renderSidebar({
    addRepository: () => undefined,
    prepareAgent: () => undefined,
    importSession: () => undefined,
    loadSavedSessions: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });
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
    prepareAgent: () => undefined,
    importSession: () => undefined,
    loadSavedSessions: () => undefined,
    renameSession: () => undefined,
    selectSession: () => undefined,
  });
  const thread = within(document.body).getByRole('button', {
    name: 'Codebase rating feedback',
  });

  fireEvent.contextMenu(thread);

  assert.ok(within(document.body).getByRole('menuitem', { name: 'Rename' }));
  assert.ok(within(document.body).getByRole('menuitem', { name: 'Archive' }));
});
