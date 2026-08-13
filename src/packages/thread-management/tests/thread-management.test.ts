import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  emptyThreadManagementState,
  hasUnseenThreadActivity,
  movePinnedThread,
  moveRepositoryThread,
  orderRepositoryPaths,
  orderRepositoryThreadIds,
  parseThreadManagementState,
  rememberRepositoryPaths,
  setExpandedRepository,
  setRepositoryHidden,
  setRepositoryLabel,
  setThreadArchived,
  setThreadPinned,
  setThreadViewedAt,
  setWorkspaceArchived,
} from '../index';

test('tracks unseen Agent output with a monotonic viewed watermark', () => {
  const viewed = setThreadViewedAt(
    emptyThreadManagementState,
    'session:/one.jsonl',
    '2026-08-13T02:00:00.000Z',
  );

  assert.equal(
    hasUnseenThreadActivity(
      viewed,
      'session:/one.jsonl',
      '2026-08-13T02:01:00.000Z',
    ),
    true,
  );
  assert.equal(
    hasUnseenThreadActivity(
      viewed,
      'session:/one.jsonl',
      '2026-08-13T02:00:00.000Z',
    ),
    false,
  );
  assert.equal(
    setThreadViewedAt(
      viewed,
      'session:/one.jsonl',
      '2026-08-13T01:59:00.000Z',
    ),
    viewed,
  );
});

test('rejects malformed persisted thread preferences', () => {
  assert.deepEqual(
    parseThreadManagementState({
      archivedThreadIds: ['one', 'one'],
      orderByRepository: {},
    }),
    emptyThreadManagementState,
  );
});

test('archives and expands one repository without mutating prior state', () => {
  const archived = setThreadArchived(
    emptyThreadManagementState,
    'session:/one.jsonl',
    true,
  );
  const expanded = setExpandedRepository(archived, '/workspace/ernie');

  assert.deepEqual(archived.archivedThreadIds, ['session:/one.jsonl']);
  assert.equal(expanded.expandedRepositoryPath, '/workspace/ernie');
  assert.deepEqual(emptyThreadManagementState.archivedThreadIds, []);
});

test('archives one branch workspace without changing its Git identity', () => {
  const archived = setWorkspaceArchived(
    emptyThreadManagementState,
    '/workspace/ernie-worktrees/feature/calm-ui',
    true,
  );
  const restored = setWorkspaceArchived(
    archived,
    '/workspace/ernie-worktrees/feature/calm-ui',
    false,
  );

  assert.deepEqual(archived.archivedWorkspacePaths, [
    '/workspace/ernie-worktrees/feature/calm-ui',
  ]);
  assert.deepEqual(restored.archivedWorkspacePaths, []);
  assert.deepEqual(emptyThreadManagementState.archivedWorkspacePaths, []);
});

test('loads legacy preferences without pinned threads', () => {
  assert.deepEqual(
    parseThreadManagementState({
      archiveFolded: true,
      archivedThreadIds: ['session:/one.jsonl'],
      foldedRepositoryPaths: ['/workspace/ernie'],
      orderByRepository: {},
    }),
    {
      ...emptyThreadManagementState,
      archivedThreadIds: ['session:/one.jsonl'],
    },
  );
});

test('pins and unpins one thread without mutating prior state', () => {
  const pinned = setThreadPinned(
    emptyThreadManagementState,
    'session:/one.jsonl',
    true,
  );
  const unpinned = setThreadPinned(pinned, 'session:/one.jsonl', false);

  assert.deepEqual(pinned.pinnedThreadIds, ['session:/one.jsonl']);
  assert.deepEqual(unpinned.pinnedThreadIds, []);
  assert.deepEqual(emptyThreadManagementState.pinnedThreadIds, []);
});

test('keeps manual pin order stable', () => {
  const state = {
    ...emptyThreadManagementState,
    pinnedThreadIds: ['one', 'two', 'three'],
  };

  assert.deepEqual(movePinnedThread(state, 'three', 'one').pinnedThreadIds, [
    'three',
    'one',
    'two',
  ]);
});

test('persists repository labels, visibility, and first-seen order', () => {
  const remembered = rememberRepositoryPaths(emptyThreadManagementState, [
    '/workspace/ernie',
    '/workspace/kastuli',
  ]);
  const updated = setRepositoryHidden(
    setRepositoryLabel(remembered, '/workspace/ernie', 'Ernie app'),
    '/workspace/kastuli',
    true,
  );
  const rediscovered = rememberRepositoryPaths(updated, [
    '/workspace/new',
    '/workspace/ernie',
  ]);

  assert.equal(rediscovered.repositoryLabels['/workspace/ernie'], 'Ernie app');
  assert.deepEqual(rediscovered.hiddenRepositoryPaths, ['/workspace/kastuli']);
  assert.deepEqual(
    orderRepositoryPaths(rediscovered, [
      '/workspace/new',
      '/workspace/kastuli',
      '/workspace/ernie',
    ]),
    ['/workspace/ernie', '/workspace/kastuli', '/workspace/new'],
  );
});

test('orders known threads and appends newly discovered threads', () => {
  const reordered = moveRepositoryThread(
    emptyThreadManagementState,
    '/workspace/ernie',
    ['one', 'two', 'three'],
    'three',
    'one',
  );

  assert.deepEqual(
    orderRepositoryThreadIds(reordered, '/workspace/ernie', [
      'one',
      'two',
      'three',
      'four',
    ]),
    ['three', 'one', 'two', 'four'],
  );
});
