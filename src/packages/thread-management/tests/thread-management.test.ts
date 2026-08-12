import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  emptyThreadManagementState,
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
} from '../index';

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
