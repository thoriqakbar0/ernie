import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  emptyThreadManagementState,
  moveRepositoryThread,
  orderRepositoryThreadIds,
  parseThreadManagementState,
  setRepositoryFolded,
  setThreadArchived,
  setThreadPinned,
} from '../index';

test('rejects malformed persisted thread preferences', () => {
  assert.deepEqual(
    parseThreadManagementState({
      archiveFolded: true,
      archivedThreadIds: ['one', 'one'],
      foldedRepositoryPaths: [],
      orderByRepository: {},
    }),
    emptyThreadManagementState,
  );
});

test('archives and folds without mutating prior state', () => {
  const archived = setThreadArchived(
    emptyThreadManagementState,
    'session:/one.jsonl',
    true,
  );
  const folded = setRepositoryFolded(archived, '/workspace/ernie', true);

  assert.deepEqual(archived.archivedThreadIds, ['session:/one.jsonl']);
  assert.deepEqual(folded.foldedRepositoryPaths, ['/workspace/ernie']);
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
      foldedRepositoryPaths: ['/workspace/ernie'],
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
