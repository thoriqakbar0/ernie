import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SettingsPage } from '@/components/settings-page';

afterEach(cleanup);

test('settings apply appearance and tool actions immediately', async () => {
  const themeChanges: boolean[] = [];
  const annotationChanges: boolean[] = [];
  let closeCount = 0;
  let openPluginsCount = 0;
  let reloadCount = 0;
  const user = userEvent.setup();

  render(
    <SettingsPage
      backLabel="Back to Agent"
      darkModeEnabled
      onClose={() => {
        closeCount += 1;
      }}
      onDarkModeEnabledChange={(enabled) => themeChanges.push(enabled)}
      onOpenPlugins={() => {
        openPluginsCount += 1;
      }}
      onReactGrabEnabledChange={(enabled) => annotationChanges.push(enabled)}
      onReload={() => {
        reloadCount += 1;
      }}
      reactGrabEnabled={false}
    />,
  );

  const settings = within(document.body).getByRole('region', {
    name: 'Settings',
  });
  assert.equal(
    within(settings).getByRole('button', { name: 'Dark' }).getAttribute(
      'aria-pressed',
    ),
    'true',
  );

  await user.click(within(settings).getByRole('button', { name: 'Light' }));
  await user.click(within(settings).getByRole('switch', { name: 'Annotate' }));
  await user.click(within(settings).getByRole('button', { name: 'Reload' }));
  await user.click(within(settings).getByRole('button', { name: 'Manage' }));
  await user.click(
    within(settings).getByRole('button', { name: 'Back to Agent' }),
  );

  assert.deepEqual(themeChanges, [false]);
  assert.deepEqual(annotationChanges, [true]);
  assert.equal(reloadCount, 1);
  assert.equal(openPluginsCount, 1);
  assert.equal(closeCount, 1);
});
