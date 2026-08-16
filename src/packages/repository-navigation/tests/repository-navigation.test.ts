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
    { pinsExpanded: false, searchQuery: 'saved' },
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
    pinsExpanded: false,
    searchQuery: '',
  });
  const disconnected = projectRepositoryNavigation(
    { ...source, connected: false },
    viewed,
    { pinsExpanded: false, searchQuery: '' },
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
        { pinsExpanded: false, searchQuery: '' },
      ),
    /duplicate folder paths/u,
  );
});
