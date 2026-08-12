import '@testing-library/jest-dom'
import { expect, test } from '@rstest/core'
import { fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import { App } from '../app.js'

test('renders the first Ernie Agent roster slice', async () => {
  render(<App />)

  const root = elementTree.root
  if (root === undefined) throw new Error('The Lynx element root is missing.')
  const screen = getQueriesForElement(root)

  expect(await screen.findByText('Prime Agent')).toBeInTheDocument()
  expect(
    await screen.findByText('Start the Lynx port as a customizable v1.'),
  ).toBeInTheDocument()
  expect(await screen.findByPlaceholderText('Give Ernie a task…')).toBeInTheDocument()
})

test('selecting another Agent updates the detail surface', async () => {
  render(<App />)

  const root = elementTree.root
  if (root === undefined) throw new Error('The Lynx element root is missing.')
  const screen = getQueriesForElement(root)
  const accessibilityAgent = await screen.findByText('Review accessibility')

  fireEvent.tap(accessibilityAgent)

  expect(
    await screen.findByText('Waiting for a native-host accessibility test.'),
  ).toBeInTheDocument()
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
