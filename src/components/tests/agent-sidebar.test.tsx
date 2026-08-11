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
  readonly selectSession: (activeSessionId: string) => void;
}): void {
  render(
    <TooltipProvider>
      <SidebarProvider>
        <AgentSidebar
          creatingAgent={false}
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
          changeFolder={() => undefined}
          chooseWorkspaceDirectory={actions.addRepository}
          createAgent={actions.createAgent}
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
    selectSession: (activeSessionId) => selectedSessions.push(activeSessionId),
  });

  await user.click(
    within(document.body).getByRole('button', { name: 'General chat' }),
  );

  assert.deepEqual(selectedSessions, ['general-agent']);
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
