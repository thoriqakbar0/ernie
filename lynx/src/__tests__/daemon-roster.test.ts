import { expect, test } from '@rstest/core'

import { parseDaemonRoster } from '../daemon-roster.js'

test('accepts a complete active Agent roster from the host', () => {
  expect(parseDaemonRoster({
    activeAgents: [{
      activeSessionId: 'agent-1',
      activity: 'working',
      cwd: '/workspace/ernie',
      modifiedAt: '2026-08-13T09:00:00.000Z',
      name: 'Receive the daemon roster',
    }],
    connection: 'ready',
    currentCwd: '/workspace/ernie',
    revision: 4,
  })).toEqual({
    activeAgents: [{
      activeSessionId: 'agent-1',
      activity: 'working',
      cwd: '/workspace/ernie',
      modifiedAt: '2026-08-13T09:00:00.000Z',
      name: 'Receive the daemon roster',
    }],
    connection: 'ready',
    currentCwd: '/workspace/ernie',
    revision: 4,
  })
})

test('rejects an invalid Agent at the Lynx boundary', () => {
  expect(parseDaemonRoster({
    activeAgents: [{
      activeSessionId: 'agent-1',
      activity: 'invented',
      cwd: '/workspace/ernie',
      modifiedAt: null,
      name: 'Invalid activity',
    }],
    connection: 'ready',
    currentCwd: '/workspace/ernie',
    revision: 1,
  })).toBeNull()
})
