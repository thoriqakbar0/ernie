import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSelectedFeedRegistry } from '../selected-feed';

test('replaces one renderer selection and ignores its stale cleanup', () => {
  const registry = createSelectedFeedRegistry<string>();
  const first = registry.replace(7, 'first');
  assert.equal(first.replaced, null);
  assert.equal(registry.attach(first.owner, 'first-feed'), true);

  const second = registry.replace(7, 'second');
  assert.equal(second.replaced, 'first-feed');
  assert.equal(registry.isCurrent(first.owner), false);
  assert.equal(registry.attach(first.owner, 'stale-feed'), false);
  assert.equal(registry.attach(second.owner, 'second-feed'), true);

  assert.equal(registry.stop(7, 'first'), null);
  assert.equal(registry.isCurrent(second.owner), true);
  assert.equal(registry.stop(7, 'second'), 'second-feed');
  assert.equal(registry.isCurrent(second.owner), false);
});

test('stops the selected feed when its renderer exits', () => {
  const registry = createSelectedFeedRegistry<string>();
  const selection = registry.replace(11, 'selected');
  assert.equal(registry.attach(selection.owner, 'selected-feed'), true);

  assert.equal(registry.stopSender(11), 'selected-feed');
  assert.equal(registry.stopSender(11), null);
});
