import '@testing-library/jest-dom'
import { expect, test } from '@rstest/core'
import { fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import { AgentSidebar } from '../agent-sidebar.js'
import { App } from '../app.js'
import { formatAnnotationContext } from '../component-annotation.js'
import type { AgentSession } from '../daemon-client.js'

const sessions = [
  {
    activeSessionId: 'working-agent',
    activity: 'working',
    cwd: '/workspace/ernie',
    modifiedAt: null,
    name: 'Port the sidebar',
  },
  {
    activeSessionId: 'input-agent',
    activity: 'needs_input',
    cwd: '/workspace/ernie-worktree',
    modifiedAt: null,
    name: 'Review the daemon bridge',
  },
] as const satisfies readonly AgentSession[]

test('renders the Lynx runtime and new-Agent header', async () => {
  render(<App />)

  const root = elementTree.root
  if (root === undefined) throw new Error('The Lynx element root is missing.')
  const screen = getQueriesForElement(root)

  expect(await screen.findByText('New Agent')).toBeInTheDocument()
  expect(await screen.findByText('Prime Agent')).toBeInTheDocument()
})

test('ports grouped live Agent rows into the Lynx sidebar', async () => {
  const selected: string[] = []
  render(
    <AgentSidebar
      connection='ready'
      currentCwd='/workspace/ernie'
      onOpenSettings={() => undefined}
      onSelect={activeSessionId => selected.push(activeSessionId)}
      onStartDraft={() => undefined}
      selectedSessionId='working-agent'
      sessions={sessions}
      width='balanced'
    />,
  )

  const root = elementTree.root
  if (root === undefined) throw new Error('The Lynx element root is missing.')
  const screen = getQueriesForElement(root)

  expect(await screen.findByText('Repositories')).toBeInTheDocument()
  expect(await screen.findByText('1 working')).toBeInTheDocument()
  expect(await screen.findByText('1 needs input')).toBeInTheDocument()
  fireEvent.tap(await screen.findByText('Review the daemon bridge'))
  expect(selected).toEqual(['input-agent'])
})

test('opens jellyware controls from the title bar', async () => {
  render(<App />)

  const root = elementTree.root
  if (root === undefined) throw new Error('The Lynx element root is missing.')
  const screen = getQueriesForElement(root)

  fireEvent.tap(await screen.findByText('Customize'))

  expect(await screen.findByText('Make Ernie yours')).toBeInTheDocument()
  expect(await screen.findByText('compact')).toBeInTheDocument()
  expect(await screen.findByText('roomy')).toBeInTheDocument()
})

test('formats source-aware Lynx annotation context', () => {
  expect(formatAnnotationContext({
    component: 'AgentRow',
    id: 'agent-row-working-agent',
    label: 'Port the sidebar',
    source: 'lynx/src/agent-sidebar.tsx',
  })).toBe([
    'lynx component: AgentRow',
    'source: lynx/src/agent-sidebar.tsx',
    'region: Port the sidebar',
    'runtime: ReactLynx',
  ].join('\n'))
})

test('opens the native Lynx annotation panel', async () => {
  render(<App />)

  const root = elementTree.root
  if (root === undefined) throw new Error('The Lynx element root is missing.')
  const screen = getQueriesForElement(root)

  fireEvent.tap(await screen.findByText('Annotate'))

  expect(await screen.findByText('Lynx component annotation')).toBeInTheDocument()
  expect(await screen.findByText('No component selected')).toBeInTheDocument()
})
