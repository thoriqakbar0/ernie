import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as Accordion from '@/components/trovecn/ui/accordion';
import * as Button from '@/components/trovecn/ui/button';
import * as Checkbox from '@/components/trovecn/ui/checkbox';
import * as Combobox from '@/components/trovecn/ui/combobox';
import * as ContextMenu from '@/components/trovecn/ui/context-menu';
import * as Dialog from '@/components/trovecn/ui/dialog';
import * as Drawer from '@/components/trovecn/ui/drawer';
import * as Menu from '@/components/trovecn/ui/menu';
import * as NavigationMenu from '@/components/trovecn/ui/navigation-menu';
import * as Popover from '@/components/trovecn/ui/popover';
import * as Slider from '@/components/trovecn/ui/slider';
import * as Switch from '@/components/trovecn/ui/switch';
import * as Tabs from '@/components/trovecn/ui/tabs';
import * as Tooltip from '@/components/trovecn/ui/tooltip';
import { Conversation } from '@/components/trovecn/ai-workbench/conversation';
import { PromptComposer } from '@/components/trovecn/ai-workbench/prompt-composer';

afterEach(cleanup);

test('every trove/cn registry component module loads', () => {
  const modules = [
    Accordion,
    Button,
    Checkbox,
    Combobox,
    ContextMenu,
    Dialog,
    Drawer,
    Menu,
    NavigationMenu,
    Popover,
    Slider,
    Switch,
    Tabs,
    Tooltip,
  ];

  assert.equal(modules.every((module) => Object.keys(module).length > 0), true);
});

test('conversation renders authored messages', () => {
  render(
    <Conversation
      messages={[
        { id: 'one', role: 'user', content: 'hello' },
        { id: 'two', role: 'assistant', content: 'hi there' },
      ]}
    />,
  );

  assert.equal(within(document.body).getByText('hello').textContent, 'hello');
  assert.equal(within(document.body).getByText('hi there').textContent, 'hi there');
  assert.ok(within(document.body).getByRole('article', { name: 'Your message' }));
  assert.ok(within(document.body).getByRole('article', { name: 'Agent response' }));
  assert.ok(within(document.body).getByRole('button', { name: 'Copy message' }));
});

test('prompt composer submits trimmed text with Enter', async () => {
  const submissions: string[] = [];
  const user = userEvent.setup();

  render(
    <PromptComposer onSubmit={({ prompt }) => submissions.push(prompt)} />,
  );

  const prompt = within(document.body).getByRole('textbox', { name: 'Prompt' });
  assert.equal(prompt.getAttribute('placeholder'), 'Describe your task');
  assert.equal(within(document.body).getByRole('status').textContent, 'Ready for your prompt.');
  await user.type(prompt, '  hello  {Enter}');

  assert.deepEqual(submissions, ['hello']);
});

test('prompt composer explains how to stop a running response', () => {
  render(<PromptComposer isRunning />);

  assert.equal(
    within(document.body).getByRole('status').textContent,
    'Generating response. You can stop it at any time.',
  );
  assert.ok(within(document.body).getByRole('button', { name: 'Stop generating' }));
});
