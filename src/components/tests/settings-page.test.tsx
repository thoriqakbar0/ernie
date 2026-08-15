import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SettingsPage } from '@/components/settings-page';

afterEach(cleanup);

test('settings apply appearance and tool actions immediately', async () => {
  const themeChanges: boolean[] = [];
  const debugHudChanges: boolean[] = [];
  const thinkingOrbChanges: string[] = [];
  let closeCount = 0;
  let openPluginsCount = 0;
  let reloadCount = 0;
  const user = userEvent.setup();

  render(
    <SettingsPage
      backLabel="Back to Agent"
      darkModeEnabled
      debugHudEnabled={false}
      thinkingOrbState="solving"
      onClose={() => {
        closeCount += 1;
      }}
      onDarkModeEnabledChange={(enabled) => themeChanges.push(enabled)}
      onDebugHudEnabledChange={(enabled) => debugHudChanges.push(enabled)}
      onOpenPlugins={() => {
        openPluginsCount += 1;
      }}
      onReload={() => {
        reloadCount += 1;
      }}
      onThinkingOrbStateChange={(state) => thinkingOrbChanges.push(state)}
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
  await user.click(
    within(settings).getByRole('switch', { name: 'Debug interface' }),
  );
  assert.ok(
    within(settings).getByRole('img', {
      name: 'Solving thinking animation preview',
    }),
  );
  await user.click(
    within(settings).getByRole('combobox', { name: 'Thinking animation' }),
  );
  assert.deepEqual(
    within(document.body)
      .getAllByRole('option')
      .map((option) => option.textContent),
    [
      'Working',
      'Searching',
      'Solving',
      'Listening',
      'Connecting',
      'Weaving',
      'Composing',
      'Breathing',
      'Shaping',
    ],
  );
  await user.click(
    within(document.body).getByRole('option', { name: 'Searching' }),
  );
  await user.click(within(settings).getByRole('button', { name: 'Reload' }));
  await user.click(within(settings).getByRole('button', { name: 'Manage' }));
  await user.click(
    within(settings).getByRole('button', { name: 'Back to Agent' }),
  );

  assert.deepEqual(themeChanges, [false]);
  assert.deepEqual(debugHudChanges, [true]);
  assert.deepEqual(thinkingOrbChanges, ['searching']);
  assert.equal(reloadCount, 1);
  assert.equal(openPluginsCount, 1);
  assert.equal(closeCount, 1);
});
