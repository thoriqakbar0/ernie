import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, fireEvent, render, within } from '@testing-library/react';

import { DebugHud } from '@/components/debug-hud';

afterEach(cleanup);

test('debug HUD reports the clicked semantic target and active loading work', () => {
  render(
    <>
      <button
        type="button"
        aria-label="Open Agent"
        aria-description="needs input"
        aria-current="page"
        data-active="true"
        data-slot="button"
      >
        Agent
      </button>
      <DebugHud
        connection="ready"
        loadingOperations={['Agent response', 'Git branch']}
        status="Loading branch details…"
      />
    </>,
  );

  fireEvent.click(within(document.body).getByRole('button', { name: 'Open Agent' }));

  const hud = within(document.body).getByRole('complementary', {
    name: 'Interface debug HUD',
  });
  assert.ok(within(hud).getByText('Open Agent'));
  assert.ok(
    within(hud).getByText(
      'button · slot button · current page · needs input · active',
    ),
  );
  assert.ok(within(hud).getByText('Agent response · Git branch'));
  assert.ok(within(hud).getByText('Loading branch details…'));
});
