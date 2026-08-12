import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AgentChat } from '@/components/agent-chat';
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

test('focused chat keeps depth beside the composer when no Agents spawned', () => {
  render(
    <AgentChat
      depth={2}
      sessionView={{
        activeSessionId: 'root',
        isStreaming: false,
        messages: [{ id: 'one', role: 'assistant', text: 'ready' }],
        rlmMaxDepth: 2,
        sessionName: 'Ready',
        spawnedSessions: [],
        transcript: [
          { id: 'one', kind: 'message', role: 'assistant', text: 'ready' },
        ],
      }}
    />,
  );

  assert.equal(
    within(document.body).queryByRole('button', { name: 'depth 2' }),
    null,
  );
  assert.equal(within(document.body).queryByText('depth 2'), null);
});

test('focused chat renders Prime Agent markdown as document structure', () => {
  render(
    <AgentChat
      depth={2}
      sessionView={{
        activeSessionId: 'root',
        isStreaming: false,
        messages: [
          {
            id: 'one',
            role: 'assistant',
            text: '**Verdict:** strong\n\n- clear\n- calm',
          },
        ],
        rlmMaxDepth: 2,
        sessionName: 'Verdict',
        spawnedSessions: [],
        transcript: [
          {
            id: 'one',
            kind: 'message',
            role: 'assistant',
            text: '**Verdict:** strong\n\n- clear\n- calm',
          },
        ],
      }}
    />,
  );

  assert.equal(within(document.body).getByText('Verdict:').tagName, 'STRONG');
  assert.equal(within(document.body).getAllByRole('listitem').length, 2);
});

test('focused chat collapses completed IPython code and output until requested', async () => {
  const user = userEvent.setup();
  render(
    <AgentChat
      depth={2}
      sessionView={{
        activeSessionId: 'root',
        isStreaming: false,
        messages: [{ id: 'one', role: 'assistant', text: 'calculated' }],
        rlmMaxDepth: 2,
        sessionName: 'Calculate',
        spawnedSessions: [],
        transcript: [
          {
            attachments: [],
            code: 'answer = 6 * 7\nanswer',
            durationMs: 18,
            id: 'cell-1',
            kind: 'ipython',
            result: '42',
            status: 'ok',
            stderr: null,
            stdout: 'calculated\n',
            traceback: [],
          },
        ],
      }}
    />,
  );

  const cell = within(document.body).getByRole('region', {
    name: 'IPython cell 1',
  });
  assert.equal(within(cell).queryByText('42'), null);
  await user.click(within(cell).getByRole('button', { name: 'Expand IPython cell 1' }));
  assert.match(cell.textContent ?? '', /answer = 6 \* 7\s+answer/u);
  assert.match(cell.textContent ?? '', /calculated\s+42/u);
  assert.ok(within(cell).getByRole('button', { name: 'Copy IPython code' }));
});

test('focused chat reveals a recursively indexed spawned Agent tree', () => {
  render(
    <AgentChat
      depth={2}
      sessionView={{
        activeSessionId: 'root',
        isStreaming: true,
        messages: [{ id: 'one', role: 'assistant', text: 'working' }],
        rlmMaxDepth: 2,
        sessionName: 'Working',
        spawnedSessions: [
          {
            activeSessionId: 'research-active',
            activity: 'ipython',
            durationMs: 1200,
            error: null,
            id: 'research',
            name: 'Research',
            parentId: null,
            recap: 'Reviewing the code',
            status: 'working',
          },
          {
            activeSessionId: 'verify-active',
            activity: null,
            durationMs: 800,
            error: null,
            id: 'verify',
            name: 'Verify',
            parentId: 'research',
            recap: 'Tests passed',
            status: 'done',
          },
        ],
        transcript: [
          { id: 'one', kind: 'message', role: 'assistant', text: 'working' },
        ],
      }}
    />,
  );

  const spawnedAgents = within(document.body).getByRole('region', {
    name: 'Spawned agents',
  });
  assert.ok(spawnedAgents);
  assert.ok(within(spawnedAgents).getByText('Research'));
  assert.ok(within(spawnedAgents).getByText('Verify'));
  assert.ok(within(spawnedAgents).getByText('working'));
  assert.ok(within(spawnedAgents).getByText('done'));
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
