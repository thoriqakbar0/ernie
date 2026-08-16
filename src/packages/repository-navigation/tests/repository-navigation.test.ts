import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  emptyRepositoryNavigationPreferences,
  parseRepositoryNavigationPreferences,
  projectRepositoryNavigation,
  transitionRepositoryNavigation,
  type RepositoryNavigationSource,
} from '../index';

const source: RepositoryNavigationSource = {
  connected: true,
  folders: [
    {
      branchName: null,
      label: 'ernie',
      repositoryCwd: '/work/ernie',
      value: '/work/ernie',
    },
    {
      branchName: 'feature/calm-ui',
      label: 'calm-ui',
      repositoryCwd: '/work/ernie',
      value: '/work/ernie-calm-ui',
    },
  ],
  importingSessionPath: null,
  liveSessions: [
    {
      activeSessionId: 'live-one',
      activity: 'idle',
      cwd: '/work/ernie',
      modifiedAt: '2026-08-13T02:01:00.000Z',
      name: 'Live Agent',
      sessionPath: '/sessions/one.jsonl',
    },
  ],
  savedSessions: [
    {
      activity: 'settled',
      cwd: '/work/ernie',
      modifiedAt: '2026-08-13T02:00:00.000Z',
      name: 'Live Agent',
      path: '/sessions/one.jsonl',
    },
    {
      activity: 'settled',
      cwd: '/work/ernie-calm-ui',
      modifiedAt: '2026-08-12T02:00:00.000Z',
      name: 'Saved Agent',
      path: '/sessions/two.jsonl',
    },
    {
      activity: 'settled',
      cwd: '/work/ernie',
      modifiedAt: '2026-08-11T02:00:00.000Z',
      name: 'Earlier Agent',
      path: '/sessions/three.jsonl',
    },
  ],
  selectedSessionId: 'live-one',
};

const collapsedDisplay = {
  pinsExpanded: false,
  revealedWorkspaceCwd: null,
  searchQuery: '',
  selectedCwd: null,
  settledExpandedRepositoryPaths: new Set<string>(),
  worktreesExpandedRepositoryPaths: new Set<string>(),
} as const;

test('parses legacy storage and rejects malformed preferences', () => {
  assert.deepEqual(
    parseRepositoryNavigationPreferences({
      archiveFolded: true,
      archivedThreadIds: ['session:/sessions/one.jsonl'],
      orderByRepository: {},
    }),
    {
      ...emptyRepositoryNavigationPreferences,
      archivedConversationIds: ['session:/sessions/one.jsonl'],
    },
  );
  assert.deepEqual(
    parseRepositoryNavigationPreferences({
      archivedThreadIds: ['one', 'one'],
      orderByRepository: {},
    }),
    emptyRepositoryNavigationPreferences,
  );
});

test('projects canonical conversations, repositories, and search results', () => {
  const projection = projectRepositoryNavigation(
    source,
    emptyRepositoryNavigationPreferences,
    { ...collapsedDisplay, searchQuery: 'saved' },
  );

  assert.deepEqual(
    projection.repositories[0]?.conversations.map((conversation) => conversation.id),
    [
      'session:/sessions/one.jsonl',
      'session:/sessions/three.jsonl',
      'session:/sessions/two.jsonl',
    ],
  );
  assert.equal(projection.repositories[0]?.workspaces[0]?.folder.value, '/work/ernie');
  assert.equal(projection.selectedConversationId, 'session:/sessions/one.jsonl');
  assert.deepEqual(
    projection.searchResults.map((result) => result.key),
    ['Agent:session:/sessions/two.jsonl'],
  );
});

test('projects disconnected activity and unseen output truthfully', () => {
  const viewed = transitionRepositoryNavigation(
    emptyRepositoryNavigationPreferences,
    source,
    {
      type: 'mark-viewed',
      conversationId: 'session:/sessions/one.jsonl',
      viewedAt: '2026-08-13T02:00:00.000Z',
    },
  );
  const connected = projectRepositoryNavigation(source, viewed, {
    ...collapsedDisplay,
  });
  const disconnected = projectRepositoryNavigation(
    { ...source, connected: false },
    viewed,
    collapsedDisplay,
  );

  assert.equal(connected.repositories[0]?.conversations[0]?.activity, 'needs_input');
  assert.equal(disconnected.repositories[0]?.conversations[0]?.activity, 'idle');
  assert.equal(
    transitionRepositoryNavigation(viewed, source, {
      type: 'mark-viewed',
      conversationId: 'session:/sessions/one.jsonl',
      viewedAt: '2026-08-13T01:59:00.000Z',
    }),
    viewed,
  );
});

test('transitions durable order, pin, archive, label, and visibility', () => {
  const remembered = transitionRepositoryNavigation(
    emptyRepositoryNavigationPreferences,
    source,
    { type: 'remember-repositories' },
  );
  const pinned = transitionRepositoryNavigation(remembered, source, {
    type: 'set-conversation-pinned',
    conversationId: 'session:/sessions/one.jsonl',
    pinned: true,
  });
  const archived = transitionRepositoryNavigation(pinned, source, {
    type: 'set-conversation-archived',
    conversationId: 'session:/sessions/one.jsonl',
    archived: true,
  });
  const labeled = transitionRepositoryNavigation(archived, source, {
    type: 'set-repository-label',
    repositoryPath: '/work/ernie',
    label: 'Ernie app',
  });
  const hidden = transitionRepositoryNavigation(labeled, source, {
    type: 'set-repository-hidden',
    repositoryPath: '/work/ernie',
    hidden: true,
  });
  const workspaceArchived = transitionRepositoryNavigation(hidden, source, {
    type: 'set-workspace-archived',
    workspacePath: '/work/ernie-calm-ui',
    archived: true,
  });

  assert.deepEqual(remembered.repositoryOrder, ['/work/ernie']);
  assert.deepEqual(archived.archivedConversationIds, ['session:/sessions/one.jsonl']);
  assert.deepEqual(archived.pinnedConversationIds, []);
  assert.equal(labeled.repositoryLabels['/work/ernie'], 'Ernie app');
  assert.deepEqual(hidden.hiddenRepositoryPaths, ['/work/ernie']);
  assert.deepEqual(workspaceArchived.archivedWorkspacePaths, [
    '/work/ernie-calm-ui',
  ]);
});

test('reorders conversations and ignores stale interface commands', () => {
  const reordered = transitionRepositoryNavigation(
    emptyRepositoryNavigationPreferences,
    source,
    {
      type: 'move-conversation',
      workspacePath: '/work/ernie',
      sourceConversationId: 'session:/sessions/three.jsonl',
      targetConversationId: 'session:/sessions/one.jsonl',
    },
  );
  const stale = transitionRepositoryNavigation(reordered, source, {
    type: 'set-conversation-pinned',
    conversationId: 'missing',
    pinned: true,
  });

  assert.deepEqual(reordered.orderByWorkspace['/work/ernie'], [
    'session:/sessions/three.jsonl',
    'session:/sessions/one.jsonl',
  ]);
  assert.equal(stale, reordered);
});

test('fails fast when typed source identities are impossible', () => {
  assert.throws(
    () =>
      projectRepositoryNavigation(
        { ...source, folders: [source.folders[0]!, source.folders[0]!] },
        emptyRepositoryNavigationPreferences,
        collapsedDisplay,
      ),
    /duplicate folder paths/u,
  );
});

test('projects settled and quiet-worktree disclosure before rendering', () => {
  const root = source.folders[0]!;
  const quietWorktrees = Array.from({ length: 6 }, (_, index) => ({
    branchName: `feature/quiet-${index + 1}`,
    label: `quiet-${index + 1}`,
    repositoryCwd: root.value,
    value: `/work/ernie-quiet-${index + 1}`,
  }));
  const settledSessions = Array.from({ length: 5 }, (_, index) => ({
    activity: 'settled' as const,
    cwd: root.value,
    modifiedAt: `2026-08-${String(10 - index).padStart(2, '0')}T10:00:00.000Z`,
    name: `Settled ${index + 1}`,
    path: `/sessions/settled-${index + 1}.jsonl`,
  }));
  const disclosureSource: RepositoryNavigationSource = {
    connected: true,
    folders: [root, ...quietWorktrees],
    importingSessionPath: null,
    liveSessions: quietWorktrees.map((folder, index) => ({
        activity: 'idle' as const,
        activeSessionId: `quiet-${index + 1}`,
        cwd: folder.value,
        modifiedAt: null,
        name: `Quiet ${index + 1}`,
        sessionPath: `/sessions/quiet-${index + 1}.jsonl`,
      })),
    savedSessions: settledSessions,
    selectedSessionId: null,
  };

  const collapsed = projectRepositoryNavigation(
    disclosureSource,
    emptyRepositoryNavigationPreferences,
    collapsedDisplay,
  ).visibleRepositoryViews[0]!;
  assert.equal(collapsed.rootWorkspace?.visibleConversations.length, 3);
  assert.equal(collapsed.hiddenSettledCount, 2);
  assert.equal(collapsed.visibleWorktrees.length, 5);
  assert.equal(collapsed.hiddenWorktreeCount, 1);

  const expanded = projectRepositoryNavigation(
    disclosureSource,
    emptyRepositoryNavigationPreferences,
    {
      ...collapsedDisplay,
      settledExpandedRepositoryPaths: new Set([root.value]),
      worktreesExpandedRepositoryPaths: new Set([root.value]),
    },
  ).visibleRepositoryViews[0]!;
  assert.equal(expanded.rootWorkspace?.visibleConversations.length, 5);
  assert.equal(expanded.visibleWorktrees.length, 6);
});
