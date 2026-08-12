import { expect, test } from '@rstest/core'

import { primeAgentHarness } from '../daemon-contract.js'

test('ports the immutable Prime Agent harness descriptor', () => {
  expect(Object.isFrozen(primeAgentHarness)).toBe(true)
  expect(Object.isFrozen(primeAgentHarness.capabilities)).toBe(true)
  expect(primeAgentHarness.id).toBe('prime-agent')
  expect(primeAgentHarness.capabilities).toContain('live-sessions')
  expect(primeAgentHarness.capabilities).toContain('refinement')
})
