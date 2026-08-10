import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RlmDepthPicker } from '@/components/rlm-depth-picker';

afterEach(cleanup);

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

  await user.click(
    within(document.body).getByRole('button', {
      name: 'Increase RLM depth',
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

  await user.click(
    within(document.body).getByRole('button', {
      name: 'Decrease RLM depth',
    }),
  );

  assert.deepEqual(requestedDepths, ['4']);
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

  const increaseButton = within(document.body).getByRole('button', {
    name: 'Increase RLM depth',
  });
  await user.click(increaseButton);

  assert.equal(increaseButton.getAttribute('aria-disabled'), 'true');
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

  const decreaseButton = within(document.body).getByRole('button', {
    name: 'Decrease RLM depth',
  });
  await user.click(decreaseButton);

  assert.equal(decreaseButton.getAttribute('aria-disabled'), 'true');
  assert.deepEqual(requestedDepths, []);
});

test('user can type an RLM depth and commit it with Enter', async () => {
  const requestedDepths: Array<string | null> = [];
  const user = userEvent.setup();

  render(
    <RlmDepthPicker
      busy={false}
      depth={5}
      onDepthChange={(depth) => requestedDepths.push(depth)}
    />,
  );

  const input = within(document.body).getByRole('textbox', {
    name: 'RLM depth',
  });
  await user.clear(input);
  await user.type(input, '12{Enter}');

  assert.deepEqual(requestedDepths, ['12']);
});

test('typed RLM depth is capped at twenty', async () => {
  const requestedDepths: Array<string | null> = [];
  const user = userEvent.setup();

  render(
    <RlmDepthPicker
      busy={false}
      depth={5}
      onDepthChange={(depth) => requestedDepths.push(depth)}
    />,
  );

  const input = within(document.body).getByRole('textbox', {
    name: 'RLM depth',
  });
  await user.clear(input);
  await user.type(input, '21{Enter}');

  assert.deepEqual(requestedDepths, ['20']);
});
