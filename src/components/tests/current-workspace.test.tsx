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
      set: (finish: (() => void) | null) => {
        if (finish !== null) queueMicrotask(finish);
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

test('repository selector stays stable inside a Git worktree', () => {
  render(
    <CurrentWorkspace
      busy={false}
      folders={[
        ...folders,
        {
          branchName: 'feature/ui',
          label: 'feature/ui',
          repositoryCwd: '/workspace/ernie',
          value: '/workspace/ernie-feature-ui',
        },
      ]}
      gitBranch="feature/ui"
      gitBranchBusy={false}
      gitBranches={['main', 'feature/ui']}
      gitWorktreeError={null}
      loadingWorkspace={false}
      selectedCwd="/workspace/ernie-feature-ui"
      changeFolder={() => undefined}
      chooseWorkspaceDirectory={() => undefined}
      changeGitBranch={() => undefined}
      deleteGitBranch={() => undefined}
      initializeGitRepository={() => undefined}
      createGitWorktree={() => undefined}
    />,
  );

  const repositorySelector = within(document.body).getByRole('combobox', {
    name: 'Folder location',
  });
  assert.match(repositorySelector.textContent ?? '', /ernie/u);
  assert.doesNotMatch(repositorySelector.textContent ?? '', /feature\/ui/u);
});

test('Trove launch controls change workspace and Git branch', async () => {
  const changedFolders: Array<string | null> = [];
  const changedBranches: Array<string | null> = [];
  let directoryPickerOpenCount = 0;
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
      selectedCwd="/workspace/ernie"
      changeFolder={(cwd) => changedFolders.push(cwd)}
      chooseWorkspaceDirectory={() => {
        directoryPickerOpenCount += 1;
      }}
      changeGitBranch={(branch) => changedBranches.push(branch)}
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
  const workspacePicker = within(document.body).getByRole('dialog', {
    name: 'Choose workspace directory',
  });
  const search = within(workspacePicker).getByRole('combobox', {
    name: 'Search workspaces',
  });
  assert.equal(search.getAttribute('placeholder'), 'Search workspaces…');
  const separator = within(workspacePicker).getByRole('separator');
  const chooseAnotherFolder = within(workspacePicker).getByRole('button', {
    name: 'Choose another folder…',
  });
  assert.equal(separator.nextElementSibling, chooseAnotherFolder);
  const parentDirectories = within(document.body).getAllByLabelText(
    'Parent directory /workspace',
  );
  assert.equal(parentDirectories.length, 2);
  assert.ok(
    parentDirectories.every(
      (directory) => directory.textContent === '/workspace',
    ),
  );
  await user.type(search, 'missing-workspace');
  assert.ok(within(workspacePicker).getByText('No matching workspaces.'));
  assert.ok(
    within(workspacePicker).getByRole('button', {
      name: 'Choose another folder…',
    }),
  );
  await user.clear(search);
  await user.type(search, '/workspace/kastuli');
  assert.equal(
    within(document.body).queryByRole('option', { name: /ernie/u }),
    null,
  );
  await user.click(
    within(document.body).getByRole('option', { name: /kastuli/u }),
  );
  assert.deepEqual(changedFolders, ['/workspace/kastuli']);

  await user.click(
    within(document.body).getByRole('combobox', { name: 'Folder location' }),
  );
  await user.click(
    within(document.body).getByRole('button', {
      name: 'Choose another folder…',
    }),
  );
  assert.equal(directoryPickerOpenCount, 1);

  await user.click(
    within(document.body).getByRole('button', { name: 'Git branch: main' }),
  );
  assert.ok(document.querySelector('[data-slot="menu-content"]'));
  await user.click(
    within(document.body).getByRole('menuitemradio', { name: 'feature/ui' }),
  );
  await waitFor(() => assert.deepEqual(changedBranches, ['feature/ui']));
});
