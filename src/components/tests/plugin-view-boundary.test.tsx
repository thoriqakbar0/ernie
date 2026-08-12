import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PluginViewBoundary } from '@/components/plugin-view-boundary';

afterEach(cleanup);

function BrokenPluginView(): React.JSX.Element {
  throw new Error('private plugin failure');
}

test('contains a plugin render defect and leaves host recovery available', async () => {
  const user = userEvent.setup();
  let disableCount = 0;
  const originalConsoleError = console.error;
  console.error = () => undefined;

  try {
    render(
      <PluginViewBoundary
        pluginName="Broken plugin"
        viewId="acme.broken.main"
        onDisable={() => {
          disableCount += 1;
        }}
      >
        <BrokenPluginView />
      </PluginViewBoundary>,
    );

    const alert = within(document.body).getByRole('alert');
    assert.match(alert.textContent ?? '', /contained the failure/u);
    assert.doesNotMatch(alert.textContent ?? '', /private plugin failure/u);
    await user.click(
      within(document.body).getByRole('button', { name: 'Disable plugin' }),
    );
    assert.equal(disableCount, 1);
  } finally {
    console.error = originalConsoleError;
  }
});
