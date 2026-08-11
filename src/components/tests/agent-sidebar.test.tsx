import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AgentSidebar } from '@/components/agent-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

afterEach(cleanup);

function renderSidebar(actions: {
  readonly addRepository: () => void;
  readonly createAgent: (cwd?: string) => void;
  readonly importSession: (sessionPath: string) => void;
  readonly loadSavedSessions: () => void;
  readonly selectSession: (activeSessionId: string) => void;
}): void {
  render(
    <TooltipProvider>
      <SidebarProvider>
        <AgentSidebar
          creatingAgent={false}
          importingSessionPath={null}
          loadingSavedSessions={false}
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
            },
            {
              activeSessionId: 'general-agent',
              cwd: '/workspace/kastuli',
              modifiedAt: null,
              model: null,
              name: 'General chat',
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
          createAgent={actions.createAgent}
          importSession={actions.importSession}
          loadSavedSessions={actions.loadSavedSessions}
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
    createAgent: () => undefined,
    importSession: () => undefined,
    loadSavedSessions: () => undefined,
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
    createAgent: () => undefined,
    importSession: () => undefined,
    loadSavedSessions: () => undefined,
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

test('user can add a repository and create an Agent inside one', async () => {
  let repositoryRequests = 0;
  const agentCwds: Array<string | undefined> = [];
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => {
      repositoryRequests += 1;
    },
    createAgent: (cwd) => agentCwds.push(cwd),
    importSession: () => undefined,
    loadSavedSessions: () => undefined,
    selectSession: () => undefined,
  });

  await user.click(
    within(document.body).getByRole('button', { name: 'Add repository' }),
  );
  await user.click(
    within(document.body).getByRole('button', {
      name: 'New Agent in ernie',
    }),
  );

  assert.equal(repositoryRequests, 1);
  assert.deepEqual(agentCwds, ['/workspace/ernie']);
});

test('user can import a saved Prime Agent session', async () => {
  let loadRequests = 0;
  const importedPaths: string[] = [];
  const user = userEvent.setup();
  renderSidebar({
    addRepository: () => undefined,
    createAgent: () => undefined,
    importSession: (sessionPath) => importedPaths.push(sessionPath),
    loadSavedSessions: () => {
      loadRequests += 1;
    },
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
    createAgent: () => undefined,
    importSession: (sessionPath) => importedPaths.push(sessionPath),
    loadSavedSessions: () => undefined,
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
