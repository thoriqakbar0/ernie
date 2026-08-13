import '@testing-library/jest-dom'
import { expect, test } from '@rstest/core'
import { fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import { AgentSidebar } from '../agent-sidebar.js'
import type { DaemonRoster } from '../daemon-roster.js'

const roster = {
  activeAgents: [
    {
      activeSessionId: 'idle-agent',
      activity: 'idle',
      cwd: '/workspace/ernie',
      model: null,
      modifiedAt: null,
      name: 'Quiet research',
      sessionPath: null,
    },
    {
      activeSessionId: 'working-agent',
      activity: 'working',
      cwd: '/workspace/ernie',
      model: null,
      modifiedAt: null,
      name: 'Build Lynx sidebar',
      sessionPath: null,
    },
    {
      activeSessionId: 'input-agent',
      activity: 'needs_input',
      cwd: '/workspace/ernie',
      model: null,
      modifiedAt: null,
      name: 'Review daemon contract',
      sessionPath: null,
    },
  ],
  connection: 'ready',
  currentCwd: '/workspace/ernie',
  revision: 3,
} as const satisfies DaemonRoster

test('shows active Agent names and truthful activity summaries', async () => {
  render(
    <AgentSidebar
      onSelectAgent={() => undefined}
      roster={roster}
      selectedAgentId={null}
    />,
  )

  const root = elementTree.root
  if (root === undefined) throw new Error('The Lynx element root is missing.')
  const screen = getQueriesForElement(root)

  expect(await screen.findByText('ernie')).toBeInTheDocument()
  expect(await screen.findByText('Build Lynx sidebar')).toBeInTheDocument()
  expect(await screen.findByText('Review daemon contract')).toBeInTheDocument()
  expect(await screen.findByText('1 working')).toBeInTheDocument()
  expect(await screen.findByText('1 input')).toBeInTheDocument()
})

test('shows the connected empty state without inventing Agents', async () => {
  render(
    <AgentSidebar
      onSelectAgent={() => undefined}
      roster={{ ...roster, activeAgents: [] }}
      selectedAgentId={null}
    />,
  )

  const root = elementTree.root
  if (root === undefined) throw new Error('The Lynx element root is missing.')
  const screen = getQueriesForElement(root)

  expect(await screen.findByText('No active agents')).toBeInTheDocument()
})

test('selects an Agent through the traversable row boundary', async () => {
  const selections: string[] = []
  render(
    <AgentSidebar
      onSelectAgent={activeSessionId => selections.push(activeSessionId)}
      roster={roster}
      selectedAgentId='working-agent'
    />,
  )

  const root = elementTree.root
  if (root === undefined) throw new Error('The Lynx element root is missing.')
  const screen = getQueriesForElement(root)

  fireEvent.tap(await screen.findByText('Review daemon contract'))

  expect(selections).toEqual(['input-agent'])
  expect(root.querySelector('.AgentRow--selected'))
    .toHaveAttribute('accessibility-label', 'Build Lynx sidebar, working, selected')
})
