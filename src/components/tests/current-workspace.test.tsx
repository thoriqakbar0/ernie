import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CurrentWorkspace } from '@/components/current-workspace';

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

afterEach(cleanup);

const folders = [
  {
    branchName: null,
    label: 'ernie',
    repositoryCwd: '/workspace/ernie',
    value: '/workspace/ernie',
  },
  {
    branchName: null,
    label: 'kastuli',
    repositoryCwd: '/workspace/kastuli',
    value: '/workspace/kastuli',
  },
] as const;

test('Trove launch controls change workspace and Git branch', async () => {
  const changedFolders: Array<string | null> = [];
  const changedBranches: Array<string | null> = [];
  const user = userEvent.setup();

  render(
    <CurrentWorkspace
      busy={false}
      folders={folders}
      gitBranch="main"
      gitBranchBusy={false}
      gitBranches={['main', 'feature/ui']}
      gitWorktreeError={null}
      loadingWorkspace={false}
      rlmMaxDepth={1}
      rlmMaxDepthBusy={false}
      selectedCwd="/workspace/ernie"
      changeFolder={(cwd) => changedFolders.push(cwd)}
      chooseWorkspaceDirectory={() => undefined}
      changeGitBranch={(branch) => changedBranches.push(branch)}
      changeRlmMaxDepth={() => undefined}
      deleteGitBranch={() => undefined}
      initializeGitRepository={() => undefined}
      createGitWorktree={() => undefined}
    />,
  );

  assert.ok(document.querySelector('[data-slot="combobox-trigger"]'));
  await user.click(
    within(document.body).getByRole('combobox', { name: 'Folder location' }),
  );
  assert.ok(document.querySelector('[data-slot="combobox-content"]'));
  await user.click(
    within(document.body).getByRole('option', { name: /kastuli/u }),
  );
  assert.deepEqual(changedFolders, ['/workspace/kastuli']);

  await user.click(
    within(document.body).getByRole('button', { name: 'Git branch: main' }),
  );
  assert.ok(document.querySelector('[data-slot="menu-content"]'));
  await user.click(
    within(document.body).getByRole('menuitemradio', { name: 'feature/ui' }),
  );
  await waitFor(() => assert.deepEqual(changedBranches, ['feature/ui']));
});
