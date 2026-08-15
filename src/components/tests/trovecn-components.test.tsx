import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, fireEvent, render, within } from '@testing-library/react';
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
import { motionSafeProps } from '@/components/trovecn/lib/motion-safe-props';
import type { PrimeAgentSpawnedSessionTarget } from '@/hooks/use-prime-agent-workspace';

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

test('buttons keep an opaque focus ring and stop press motion when requested', () => {
  render(<Button.Button>Continue</Button.Button>);

  const button = within(document.body).getByRole('button', { name: 'Continue' });
  assert.match(button.className, /focus-visible:ring-ring(?:\s|$)/u);
  assert.doesNotMatch(button.className, /focus-visible:ring-ring\//u);
  assert.match(button.className, /active:not-aria-\[haspopup\]:scale-\[0\.96\]/u);
  assert.match(
    button.className,
    /motion-reduce:active:not-aria-\[haspopup\]:scale-100/u,
  );
});

test('jump-to-latest control respects reduced motion', async () => {
  const user = userEvent.setup();
  const originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) =>
      ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
      }) as MediaQueryList,
  });

  try {
    render(
      <AgentChat
        sessionView={{
          activeSessionId: 'root',
          historyStart: 0,
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
    const conversation = within(document.body).getByRole('region', {
      name: 'Conversation',
    });
    const scrollArea = document.querySelector<HTMLDivElement>(
      '[data-slot="conversation-scroll-area"]',
    );
    assert.ok(scrollArea);
    Object.defineProperties(scrollArea, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
    const scrollCalls: ScrollToOptions[] = [];
    Object.defineProperty(scrollArea, 'scrollTo', {
      configurable: true,
      value: (options: ScrollToOptions) => scrollCalls.push(options),
    });
    fireEvent.scroll(scrollArea);

    const scrollToBottom = within(document.body).getByRole('button', {
      name: 'Jump to latest',
    });
    assert.equal(conversation.contains(scrollToBottom), false);
    assert.match(scrollToBottom.className, /absolute/u);
    assert.match(scrollToBottom.className, /left-1\/2/u);
    await user.click(scrollToBottom);

    assert.deepEqual(scrollCalls, [{ behavior: 'auto', top: 1_000 }]);
  } finally {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
  }
});

test('conversation offers earlier history when the transcript is windowed', async () => {
  let requests = 0;
  const user = userEvent.setup();
  render(
    <AgentChat
      onLoadEarlierHistory={() => {
        requests += 1;
      }}
      sessionView={{
        activeSessionId: 'root',
        historyStart: 80,
        isStreaming: false,
        messages: [{ id: 'latest', role: 'assistant', text: 'latest' }],
        rlmMaxDepth: 2,
        sessionName: 'Long session',
        spawnedSessions: [],
        transcript: [
          {
            id: 'latest',
            kind: 'message',
            role: 'assistant',
            text: 'latest',
          },
        ],
      }}
    />,
  );

  await user.click(
    within(document.body).getByRole('button', { name: 'Load earlier' }),
  );
  assert.equal(requests, 1);
});

test('conversation follows new output to the bottom', () => {
  const initialView = {
    activeSessionId: 'root',
    historyStart: 0,
    isStreaming: true,
    messages: [{ id: 'one', role: 'assistant' as const, text: 'working' }],
    rlmMaxDepth: 2,
    sessionName: 'Working',
    spawnedSessions: [],
    transcript: [
      {
        id: 'one',
        kind: 'message' as const,
        role: 'assistant' as const,
        text: 'working',
      },
    ],
  };
  const view = render(<AgentChat sessionView={initialView} />);
  const scrollArea = document.querySelector<HTMLDivElement>(
    '[data-slot="conversation-scroll-area"]',
  );
  assert.ok(scrollArea);
  Object.defineProperties(scrollArea, {
    scrollHeight: { configurable: true, value: 1_000 },
    scrollTop: { configurable: true, value: 0, writable: true },
  });

  view.rerender(
    <AgentChat
      sessionView={{
        ...initialView,
        transcript: [
          {
            id: 'one',
            kind: 'message',
            role: 'assistant',
            text: 'working more',
          },
        ],
      }}
    />,
  );

  assert.equal(scrollArea.scrollTop, 1_000);
});

test('conversation keeps the reader in place when new output arrives', () => {
  const initialView = {
    activeSessionId: 'root',
    historyStart: 0,
    isStreaming: true,
    messages: [{ id: 'one', role: 'assistant' as const, text: 'working' }],
    rlmMaxDepth: 2,
    sessionName: 'Working',
    spawnedSessions: [],
    transcript: [
      {
        id: 'one',
        kind: 'message' as const,
        role: 'assistant' as const,
        text: 'working',
      },
    ],
  };
  const view = render(<AgentChat sessionView={initialView} />);
  const scrollArea = document.querySelector<HTMLDivElement>(
    '[data-slot="conversation-scroll-area"]',
  );
  assert.ok(scrollArea);
  Object.defineProperties(scrollArea, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 1_000 },
    scrollTop: { configurable: true, value: 0, writable: true },
  });
  fireEvent.scroll(scrollArea);

  view.rerender(
    <AgentChat
      sessionView={{
        ...initialView,
        transcript: [
          {
            id: 'one',
            kind: 'message',
            role: 'assistant',
            text: 'working more',
          },
        ],
      }}
    />,
  );

  assert.equal(scrollArea.scrollTop, 0);
  assert.ok(within(document.body).getByRole('button', { name: 'Jump to latest' }));
});

test('conversation hides the latest-response action when all content fits', () => {
  render(
    <AgentChat
      sessionView={{
        activeSessionId: 'root',
        historyStart: 0,
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
  const scrollArea = document.querySelector<HTMLDivElement>(
    '[data-slot="conversation-scroll-area"]',
  );
  assert.ok(scrollArea);
  Object.defineProperties(scrollArea, {
    clientHeight: { configurable: true, value: 1_000 },
    scrollHeight: { configurable: true, value: 500 },
    scrollTop: { configurable: true, value: 0, writable: true },
  });
  fireEvent.scroll(scrollArea);

  assert.equal(
    within(document.body).queryByRole('button', { name: 'Jump to latest' }),
    null,
  );
});

test('Motion boundary rejects native callbacks it cannot preserve', () => {
  assert.throws(
    () =>
      motionSafeProps<HTMLDivElement>({
        onDrag: () => undefined,
      }),
    /onDrag cannot cross a Motion render boundary/u,
  );
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

test('focused chat does not duplicate composer depth', () => {
  render(
    <AgentChat
      sessionView={{
        activeSessionId: 'root',
        historyStart: 0,
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

test('focused chat keeps user messages free of a divider', () => {
  render(
    <AgentChat
      sessionView={{
        activeSessionId: 'root',
        historyStart: 0,
        isStreaming: false,
        messages: [{ id: 'one', role: 'user', text: 'hello' }],
        rlmMaxDepth: 2,
        sessionName: 'Hello',
        spawnedSessions: [],
        transcript: [
          { id: 'one', kind: 'message', role: 'user', text: 'hello' },
        ],
      }}
    />,
  );

  const message = within(document.body).getByRole('article', {
    name: 'Your message',
  });
  assert.doesNotMatch(message.className, /border-t/u);
  const ask = within(message).getByText('hello');
  assert.match(ask.className, /overflow-wrap:anywhere/u);
  assert.match(ask.className, /whitespace-pre-wrap/u);
  assert.match(ask.className, /max-h-\[min\(40vh,24rem\)\]/u);
  assert.match(ask.className, /overflow-y-auto/u);
  assert.match(ask.className, /overscroll-contain/u);
});

test('focused chat renders Prime Agent markdown as document structure', () => {
  render(
    <AgentChat
      sessionView={{
        activeSessionId: 'root',
        historyStart: 0,
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

test('focused chat groups completed work and keeps output streams distinct', async () => {
  const user = userEvent.setup();
  render(
    <AgentChat
      sessionView={{
        activeSessionId: 'root',
        historyStart: 0,
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
          {
            attachments: [],
            code: 'print("verified")',
            durationMs: 6,
            id: 'cell-2',
            kind: 'ipython',
            result: null,
            status: 'ok',
            stderr: null,
            stdout: 'verified\n',
            traceback: [],
          },
        ],
      }}
    />,
  );

  assert.equal(
    within(document.body).queryByRole('region', { name: 'IPython cell 1' }),
    null,
  );
  const work = within(document.body).getByRole('region', {
    name: 'Work: 2 steps, complete',
  });
  assert.doesNotMatch(work.className, /border/u);
  assert.match(work.className, /max-w-\[42rem\]/u);
  const disclosure = within(work).getByRole('button', { name: 'Expand work' });
  assert.match(disclosure.className, /bg-transparent/u);
  assert.match(disclosure.className, /aria-expanded:bg-transparent/u);
  assert.doesNotMatch(disclosure.className, /(?:^|\s)bg-muted\/35(?:\s|$)/u);
  const completedStatus = within(work).getByText('complete');
  assert.match(completedStatus.parentElement?.className ?? '', /text-emerald/u);
  await user.click(within(work).getByRole('button', { name: 'Expand work' }));
  assert.equal(
    within(work).getAllByRole('region', { name: /IPython cell/u }).length,
    2,
  );
  const cell = within(work).getByRole('region', {
    name: 'IPython cell 1',
  });
  assert.equal(within(cell).queryByText('42'), null);
  await user.click(within(cell).getByRole('button', { name: 'Expand IPython cell 1' }));
  assert.match(cell.textContent ?? '', /answer = 6 \* 7\s+answer/u);
  assert.match(cell.textContent ?? '', /calculated/u);
  assert.match(cell.textContent ?? '', /42/u);
  assert.ok(within(cell).getByText('stdout'));
  assert.ok(within(cell).getByText('result'));
  assert.equal(
    within(cell).queryByRole('button', { name: 'Copy IPython code' }),
    null,
  );
});

test('focused chat expands only the newest work while streaming', () => {
  render(
    <AgentChat
      thinkingOrbState="weaving"
      sessionView={{
        activeSessionId: 'root',
        historyStart: 0,
        isStreaming: true,
        messages: [{ id: 'checkpoint', role: 'assistant', text: 'checking' }],
        rlmMaxDepth: 2,
        sessionName: 'Check',
        spawnedSessions: [],
        transcript: [
          {
            attachments: [],
            code: 'first = inspect_repository()',
            durationMs: 18,
            id: 'cell-1',
            kind: 'ipython',
            result: 'ready',
            status: 'ok',
            stderr: null,
            stdout: null,
            traceback: [],
          },
          {
            id: 'checkpoint',
            kind: 'message',
            role: 'assistant',
            text: 'checking',
          },
          {
            attachments: [],
            code: 'verify_repository()',
            durationMs: null,
            id: 'cell-2',
            kind: 'ipython',
            result: null,
            status: 'running',
            stderr: null,
            stdout: null,
            traceback: [],
          },
        ],
      }}
    />,
  );

  const completedWork = within(document.body).getByRole('region', {
    name: 'Work: 1 step, complete',
  });
  const activeWork = within(document.body).getByRole('region', {
    name: 'Work: 1 step, working',
  });
  assert.equal(
    within(completedWork).queryByRole('region', { name: 'IPython cell 1' }),
    null,
  );
  assert.ok(
    within(activeWork).getByRole('region', { name: 'IPython cell 2' }),
  );
  assert.ok(
    activeWork.querySelector('canvas[data-thinking-orb-state="weaving"]'),
  );
});

test('focused chat presents failed work with a subdued summary', () => {
  render(
    <AgentChat
      sessionView={{
        activeSessionId: 'root',
        historyStart: 0,
        isStreaming: false,
        messages: [],
        rlmMaxDepth: 2,
        sessionName: 'Check',
        spawnedSessions: [],
        transcript: [
          {
            attachments: [],
            code: 'verify_repository()',
            durationMs: 18,
            id: 'cell-1',
            kind: 'ipython',
            result: null,
            status: 'error',
            stderr: 'verification failed',
            stdout: null,
            traceback: [],
          },
        ],
      }}
    />,
  );

  const work = within(document.body).getByRole('region', {
    name: 'Work: 1 step, needs attention',
  });
  const status = within(work).getByText('needs attention');
  const marker = status.parentElement?.querySelector('[aria-hidden="true"]');
  assert.match(status.parentElement?.className ?? '', /text-muted-foreground/u);
  assert.doesNotMatch(status.parentElement?.className ?? '', /text-destructive/u);
  assert.match(marker?.className ?? '', /border-current/u);
  assert.doesNotMatch(marker?.className ?? '', /bg-current/u);
  assert.match(within(work).getByText('verification failed').className, /text-destructive/u);
});

test('sending a follow-up keeps completed work collapsed', () => {
  const completedCell = {
    attachments: [],
    code: 'inspect_repository()',
    durationMs: 18,
    id: 'cell-1',
    kind: 'ipython' as const,
    result: 'ready',
    status: 'ok' as const,
    stderr: null,
    stdout: null,
    traceback: [],
  };
  const { rerender } = render(
    <AgentChat
      sessionView={{
        activeSessionId: 'root',
        historyStart: 0,
        isStreaming: false,
        messages: [{ id: 'answer', role: 'assistant', text: 'ready' }],
        rlmMaxDepth: 2,
        sessionName: 'Inspect',
        spawnedSessions: [],
        transcript: [completedCell],
      }}
    />,
  );

  const completedWork = within(document.body).getByRole('region', {
    name: 'Work: 1 step, complete',
  });
  assert.equal(
    within(completedWork).queryByRole('region', { name: 'IPython cell 1' }),
    null,
  );

  rerender(
    <AgentChat
      sessionView={{
        activeSessionId: 'root',
        historyStart: 0,
        isStreaming: true,
        messages: [{ id: 'follow-up', role: 'user', text: 'Check it again' }],
        rlmMaxDepth: 2,
        sessionName: 'Inspect',
        spawnedSessions: [],
        transcript: [
          completedCell,
          {
            id: 'follow-up',
            kind: 'message',
            role: 'user',
            text: 'Check it again',
          },
        ],
      }}
    />,
  );

  assert.equal(
    within(completedWork).queryByRole('region', { name: 'IPython cell 1' }),
    null,
  );
});

test('focused chat reveals a recursively indexed spawned Agent tree', () => {
  const openedSessions: PrimeAgentSpawnedSessionTarget[] = [];
  render(
    <AgentChat
      onOpenSpawnedSession={(session) => openedSessions.push(session)}
      sessionView={{
        activeSessionId: 'root',
        historyStart: 0,
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
    name: 'Delegated work',
  });
  assert.ok(spawnedAgents);
  assert.doesNotMatch(spawnedAgents.className, /border/u);
  assert.match(spawnedAgents.className, /max-w-\[65ch\]/u);
  assert.ok(within(spawnedAgents).getByText('Ernie spawned 2 agents'));
  assert.ok(within(spawnedAgents).getByText('1 working · 1 finished'));
  assert.ok(within(spawnedAgents).getByLabelText('2 spawned agents'));
  assert.ok(within(spawnedAgents).getByText('Research'));
  assert.ok(within(spawnedAgents).getByText('Verify'));
  const openResearch = within(spawnedAgents).getByRole('button', {
    name: 'Open Agent 1 input and output: Research',
  });
  fireEvent.click(openResearch);
  assert.deepEqual(openedSessions, [
    {
      activeSessionId: 'research-active',
      name: 'Research',
      number: 1,
    },
  ]);
  const nestedAgents = spawnedAgents.querySelector(
    '[data-slot="spawned-agent-children"]',
  );
  assert.ok(nestedAgents);
  assert.match(nestedAgents.className, /border-s/u);
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
