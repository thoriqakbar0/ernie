import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('text controls do not inherit the global focus rectangle', async () => {
  const stylesheet = await readFile(
    new URL('../../index.css', import.meta.url),
    'utf8',
  );
  const globalFocusRule = stylesheet.indexOf(
    "*:focus-visible:not([data-focus-outline='none'])",
  );
  const textControlRule = stylesheet.indexOf(
    ":is(input:not([type='checkbox']):not([type='radio']), textarea):focus-visible",
  );

  assert.notEqual(globalFocusRule, -1);
  assert.ok(textControlRule > globalFocusRule);
  assert.match(
    stylesheet.slice(textControlRule),
    /outline: none !important;\s+outline-offset: 0 !important;/u,
  );
});
