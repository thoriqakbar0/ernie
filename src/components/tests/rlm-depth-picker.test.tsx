import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { useState } from 'react';
import { Predicate } from 'effect';

import { cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RlmDepthPicker } from '@/components/rlm-depth-picker';

// Happy DOM does not implement the Web Animations APIs used by Torph.
Object.defineProperty(Element.prototype, 'getAnimations', {
  configurable: true,
  value: () => [],
});
Object.defineProperty(Element.prototype, 'animate', {
  configurable: true,
  value: (
    _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ) => {
    if (Predicate.isObject(options) && Predicate.isString(options.easing)) {
      assert.equal(options.easing.includes('NaN'), false);
    }
    const animation = { cancel: () => undefined };

    Object.defineProperty(animation, 'onfinish', {
      set: (finish: (() => void) | null) => {
        if (finish !== null) queueMicrotask(finish);
      },
    });

    return animation;
  },
});

afterEach(cleanup);

function StatefulDepthPicker(): React.JSX.Element {
  const [depth, setDepth] = useState(5);

  return (
    <RlmDepthPicker
      busy={false}
      depth={depth}
      onDepthChange={(nextDepth) => {
        if (nextDepth !== null) setDepth(Number(nextDepth));
      }}
    />
  );
}

async function openDepthEditor(
  user: ReturnType<typeof userEvent.setup>,
  depth: number,
): Promise<void> {
  await user.click(
    within(document.body).getByRole('button', { name: `Depth ${depth}` }),
  );
  assert.ok(
    within(document.body).getByRole('dialog', {
      name: 'Adjust Agent depth',
    }),
  );
}

test('user can increase the RLM depth by one', async () => {
  const requestedDepths: Array<string | null> = [];
  const user = userEvent.setup();

  render(
    <RlmDepthPicker
      busy={false}
      depth={5}
      onDepthChange={(depth) => requestedDepths.push(depth)}
    />,
  );

  await openDepthEditor(user, 5);
  await user.click(
    within(document.body).getByRole('button', {
      name: 'Increase Agent depth',
    }),
  );

  assert.deepEqual(requestedDepths, ['6']);
});

test('user can decrease the RLM depth by one', async () => {
  const requestedDepths: Array<string | null> = [];
  const user = userEvent.setup();

  render(
    <RlmDepthPicker
      busy={false}
      depth={5}
      onDepthChange={(depth) => requestedDepths.push(depth)}
    />,
  );

  await openDepthEditor(user, 5);
  await user.click(
    within(document.body).getByRole('button', {
      name: 'Decrease Agent depth',
    }),
  );

  assert.deepEqual(requestedDepths, ['4']);
});

test('popover stays open for repeated RLM depth changes', async () => {
  const user = userEvent.setup();

  render(<StatefulDepthPicker />);

  await openDepthEditor(user, 5);
  const increaseButton = within(document.body).getByRole('button', {
    name: 'Increase Agent depth',
  });

  await user.click(increaseButton);
  await user.click(increaseButton);

  assert.ok(
    within(document.body).getByRole('button', { name: 'Depth 7' }),
  );
  assert.ok(
    within(document.body).getByRole('dialog', {
      name: 'Adjust Agent depth',
    }),
  );
  assert.equal(
    within(document.body).getByLabelText('Current Agent depth').textContent,
    '7',
  );
});

test('pointer adjustment releases focus after changing depth', async () => {
  const user = userEvent.setup();

  render(
    <RlmDepthPicker
      busy={false}
      depth={5}
      onDepthChange={() => undefined}
    />,
  );

  await openDepthEditor(user, 5);
  const decreaseButton = within(document.body).getByRole('button', {
    name: 'Decrease Agent depth',
  });
  const increaseButton = within(document.body).getByRole('button', {
    name: 'Increase Agent depth',
  });

  await user.click(decreaseButton);
  assert.notEqual(document.activeElement, decreaseButton);

  await user.click(increaseButton);
  assert.notEqual(document.activeElement, increaseButton);
});

test('user cannot increase the RLM depth above twenty', async () => {
  const requestedDepths: Array<string | null> = [];
  const user = userEvent.setup();

  render(
    <RlmDepthPicker
      busy={false}
      depth={20}
      onDepthChange={(depth) => requestedDepths.push(depth)}
    />,
  );

  await openDepthEditor(user, 20);
  const increaseButton = within(document.body).getByRole('button', {
    name: 'Increase Agent depth',
  });
  await user.click(increaseButton);

  assert.equal(increaseButton.hasAttribute('disabled'), true);
  assert.deepEqual(requestedDepths, []);
});

test('user cannot decrease the RLM depth below zero', async () => {
  const requestedDepths: Array<string | null> = [];
  const user = userEvent.setup();

  render(
    <RlmDepthPicker
      busy={false}
      depth={0}
      onDepthChange={(depth) => requestedDepths.push(depth)}
    />,
  );

  await openDepthEditor(user, 0);
  const decreaseButton = within(document.body).getByRole('button', {
    name: 'Decrease Agent depth',
  });
  await user.click(decreaseButton);

  assert.equal(decreaseButton.hasAttribute('disabled'), true);
  assert.deepEqual(requestedDepths, []);
});

test('RLM depth is displayed without another text control', async () => {
  const user = userEvent.setup();

  render(
    <RlmDepthPicker
      busy={false}
      depth={5}
      onDepthChange={() => undefined}
    />,
  );

  await openDepthEditor(user, 5);

  assert.equal(
    within(document.body).queryByRole('textbox', { name: 'Agent depth' }),
    null,
  );
  assert.equal(
    within(document.body).getByLabelText('Current Agent depth').textContent,
    '5',
  );
  assert.ok(
    within(document.body).getByText('More depth uses more tokens.'),
  );
});

test('unavailable depth explains when the control becomes available', async () => {
  const user = userEvent.setup();

  render(
    <RlmDepthPicker
      busy={false}
      depth={null}
      onDepthChange={() => undefined}
    />,
  );

  const trigger = within(document.body).getByRole('button', {
    name: 'Depth unavailable',
  });
  assert.equal(trigger.hasAttribute('disabled'), false);

  await user.click(trigger);

  assert.ok(
    within(document.body).getByRole('dialog', {
      name: 'Depth unavailable',
    }),
  );
  assert.ok(
    within(document.body).getByText('Available after starting an Agent.'),
  );
  assert.equal(
    within(document.body).queryByRole('textbox', { name: 'Agent depth' }),
    null,
  );
});
