import '@testing-library/jest-dom'
import { expect, test } from '@rstest/core'
import { getQueriesForElement, render } from '@lynx-js/react/testing-library'

import { RawSessionPanel } from '../raw-session-panel.js'

test('shows the complete selected Prime Agent session payload', async () => {
  render(
    <RawSessionPanel
      session={{
        activeSessionId: 'working-agent',
        activity: 'working',
        cwd: '/workspace/ernie',
        model: {
          id: 'claude-sonnet-4-5',
          key: 'anthropic:claude-sonnet-4-5',
          name: 'Claude Sonnet 4.5',
          provider: 'anthropic',
        },
        modifiedAt: '2026-08-13T09:00:00.000Z',
        name: 'Build Lynx sidebar',
        sessionJsonl: '{"type":"message","role":"user"}\n{"type":"message","role":"assistant"}\n',
        sessionPath: '/sessions/working-agent.jsonl',
      }}
    />,
  )

  const root = elementTree.root
  if (root === undefined) throw new Error('The Lynx element root is missing.')
  const screen = getQueriesForElement(root)

  expect(await screen.findByText('Build Lynx sidebar')).toBeInTheDocument()
  const scrollView = root.querySelector('scroll-view')
  expect(scrollView).toHaveAttribute('bounces', 'true')
  expect(await screen.findByText(/"activeSessionId": "working-agent"/u)).toBeInTheDocument()
  expect(await screen.findByText(/"role":"assistant"/u)).toBeInTheDocument()
})

test('asks for a selection before showing raw session data', async () => {
  render(<RawSessionPanel session={null} />)

  const root = elementTree.root
  if (root === undefined) throw new Error('The Lynx element root is missing.')
  const screen = getQueriesForElement(root)

  expect(await screen.findByText('Select an Agent')).toBeInTheDocument()
})
