import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TaskComposer } from '@/components/task-composer';
import type {
  PrimeAgentRefinementRequest,
  PrimeAgentTaskSubmission,
} from '@/packages/prime-agent-daemon/types';

Object.defineProperty(Element.prototype, 'getAnimations', {
  configurable: true,
  value: () => [],
});
Object.defineProperty(Element.prototype, 'animate', {
  configurable: true,
  value: () => {
    const animation = { cancel: () => undefined };
    Object.defineProperty(animation, 'onfinish', {
      set: (finish: (() => void) | null) => {
        if (finish !== null) {
          queueMicrotask(finish);
        }
      },
    });
    return animation;
  },
});

const skills = [
  {
    command: '/skill:interface-review',
    content: 'Check roving tabindex and keyboard focus order.',
    description: 'Review a user interface.',
    name: 'interface-review',
  },
  {
    command: '/skill:tdd',
    content: 'Write a failing test before changing production code.',
    description: 'Write tests first.',
    name: 'tdd',
  },
] as const;

const models = [
  {
    id: 'gpt-5.6',
    key: 'openai:gpt-5.6',
    name: 'GPT-5.6',
    provider: 'openai',
  },
] as const;

const activeSessionDepthProps = {
  changeSelectedSessionRlmMaxDepth: () => undefined,
  selectedSessionRlmMaxDepth: 5,
  selectedSessionRlmMaxDepthBusy: false,
} as const;

const newSessionDepthProps = {
  changeSelectedSessionRlmMaxDepth: () => undefined,
  selectedSessionRlmMaxDepth: null,
  selectedSessionRlmMaxDepthBusy: false,
} as const;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderTaskComposer(): void {
  render(
    <TaskComposer
      {...activeSessionDepthProps}
      modelBusy={false}
      models={models}
      skills={skills}
      selectedCwd="/workspace/ernie"
      selectedModelKey="openai:gpt-5.6"
      selectedSessionId="active-agent"
      changeModel={() => undefined}
      createAgentWithTask={async () => ({ ok: true })}
    />,
  );
}

test('connected Agent keeps the composer free of placeholder actions', () => {
  renderTaskComposer();

  assert.equal(
    within(document.body).queryByRole('button', { name: 'Add context' }),
    null,
  );
  assert.ok(within(document.body).getByRole('combobox', { name: 'Model' }));
});

test('connected Agent uses the compact quick composer', () => {
  renderTaskComposer();

  const composer = within(document.body).getByRole('textbox');
  const inputGroup = composer.closest('[data-slot="input-group"]');
  assert.equal(composer.getAttribute('rows'), '1');
  assert.equal(composer.getAttribute('placeholder'), 'Ask Prime Agent…');
  assert.equal(composer.getAttribute('data-focus-outline'), 'none');
  assert.ok(
    inputGroup?.className.includes(
      'has-[[data-slot=input-group-control]:focus-visible]:border-input',
    ),
  );
  assert.ok(
    inputGroup?.className.includes(
      'has-[[data-slot=input-group-control]:focus-visible]:ring-0',
    ),
  );
  assert.ok(composer.className.includes('focus-visible:border-0'));
  assert.ok(composer.className.includes('focus-visible:outline-none'));
});

test('working Agent keeps an editable follow-up queue', async () => {
  const user = userEvent.setup();
  render(
    <TaskComposer
      {...activeSessionDepthProps}
      isGenerating
      modelBusy={false}
      models={models}
      skills={skills}
      selectedCwd="/workspace/ernie"
      selectedModelKey="openai:gpt-5.6"
      selectedSessionId="active-agent"
      changeModel={() => undefined}
      createAgentWithTask={async () => ({ ok: true })}
    />,
  );

  const composer = within(document.body).getByRole('textbox');
  assert.equal(composer.getAttribute('placeholder'), 'Add a follow-up…');
  assert.ok(within(document.body).getByRole('button', { name: 'Queue task' }));
  assert.equal(
    within(document.body)
      .getByRole('button', { name: 'Depth 5' })
      .hasAttribute('disabled'),
    false,
  );
  const workingStatus = within(document.body).getByText(
    'Working · follow-ups queue',
  );
  assert.match(workingStatus.className, /basis-full/u);

  await user.type(composer, 'Review the tests next');
  assert.equal(
    (composer as HTMLTextAreaElement).value,
    'Review the tests next',
  );
  assert.equal(composer.getAttribute('aria-keyshortcuts'), 'Alt+Enter');
  assert.equal(composer.getAttribute('title'), 'Option+Enter to queue');
});

test('Option+Enter queues a working Agent follow-up', async () => {
  const submittedTasks: PrimeAgentTaskSubmission[] = [];
  Object.defineProperty(window, 'ernie', {
    configurable: true,
    value: {
      submitAgentTask: async (submission: PrimeAgentTaskSubmission) => {
        submittedTasks.push(submission);
        return { ok: true, value: { accepted: true } };
      },
    },
  });
  const user = userEvent.setup();
  render(
    <TaskComposer
      {...activeSessionDepthProps}
      isGenerating
      modelBusy={false}
      models={models}
      skills={skills}
      selectedCwd="/workspace/ernie"
      selectedModelKey="openai:gpt-5.6"
      selectedSessionId="active-agent"
      changeModel={() => undefined}
      createAgentWithTask={async () => ({ ok: true })}
    />,
  );

  const composer = within(document.body).getByRole('textbox');
  await user.type(composer, 'Queue this after the current work');
  await user.keyboard('{Alt>}{Enter}{/Alt}');

  await waitFor(() =>
    assert.deepEqual(submittedTasks, [
      {
        activeSessionId: 'active-agent',
        message: 'Queue this after the current work',
      },
    ]),
  );
});

test('Shift+Enter refines a connected Agent with the current draft', async () => {
  const refinementRequests: PrimeAgentRefinementRequest[] = [];
  let completeRefinement = (): void => undefined;
  Object.defineProperty(window, 'ernie', {
    configurable: true,
    value: {
      refineAgentSession: (request: PrimeAgentRefinementRequest) => {
        refinementRequests.push(request);
        return new Promise((resolve) => {
          completeRefinement = () =>
            resolve({ ok: true, value: { refined: true } });
        });
      },
    },
  });
  const user = userEvent.setup();
  renderTaskComposer();

  const composer = within(document.body).getByRole('textbox');
  await user.type(composer, 'Keep the useful layout lesson');
  await user.keyboard('{Shift>}{Enter}{/Shift}');

  await waitFor(() =>
    assert.deepEqual(refinementRequests, [
      {
        activeSessionId: 'active-agent',
        instructions: 'Keep the useful layout lesson',
      },
    ]),
  );
  assert.equal(
    within(document.body).getAllByText('Refining this Prime Agent session…')
      .length,
    2,
  );
  completeRefinement();
  await waitFor(() =>
    assert.equal((composer as HTMLTextAreaElement).value, ''),
  );
  assert.equal(
    within(document.body).getByRole('status').textContent,
    'Prime Agent refined this session.',
  );
});

test('Shift+Enter remains a newline before an Agent exists', async () => {
  const user = userEvent.setup();
  render(
    <TaskComposer
      {...newSessionDepthProps}
      modelBusy={false}
      models={[]}
      skills={skills}
      selectedCwd="/workspace/ernie"
      selectedModelKey={null}
      selectedSessionId={null}
      changeModel={() => undefined}
      createAgentWithTask={async () => ({ ok: true })}
    />,
  );

  const composer = within(document.body).getByRole('textbox');
  await user.type(composer, 'First line');
  await user.keyboard('{Shift>}{Enter}{/Shift}');
  await user.type(composer, 'Second line');

  assert.equal(
    (composer as HTMLTextAreaElement).value,
    'First line\nSecond line',
  );
});

test('user can detect and insert a Prime Agent skill', async () => {
  const user = userEvent.setup();
  renderTaskComposer();

  const composer = within(document.body).getByRole('textbox');
  await user.type(composer, '/tdd');

  const skill = within(document.body).getByRole('option', {
    name: /\/skill:tdd/u,
  });
  await user.click(skill);

  assert.equal((composer as HTMLTextAreaElement).value, '/skill:tdd ');
  assert.equal(within(document.body).queryByRole('listbox'), null);
});

test('skill results scroll without moving the popup heading', async () => {
  const user = userEvent.setup();
  renderTaskComposer();

  await user.type(within(document.body).getByRole('textbox'), '/');

  const results = document.querySelector('[data-slot="skill-results"]');
  assert.ok(results);
  assert.equal(results.classList.contains('overflow-y-auto'), true);
  assert.equal(results.classList.contains('overscroll-contain'), true);
  assert.ok(within(document.body).getByText('Skills'));
});

test('user can select a detected skill with the keyboard', async () => {
  const user = userEvent.setup();
  renderTaskComposer();

  const composer = within(document.body).getByRole('textbox');
  await user.type(composer, '/');
  await user.keyboard('{ArrowDown}{Enter}');

  assert.equal((composer as HTMLTextAreaElement).value, '/skill:tdd ');
});

test('user can trigger the same skill more than once', async () => {
  const user = userEvent.setup();
  renderTaskComposer();

  const composer = within(document.body).getByRole('textbox');
  await user.type(composer, '/tdd');
  await user.click(
    within(document.body).getByRole('option', { name: /\/skill:tdd/u }),
  );
  await user.type(composer, '/tdd');
  await user.click(
    within(document.body).getByRole('option', { name: /\/skill:tdd/u }),
  );

  assert.equal(
    (composer as HTMLTextAreaElement).value,
    '/skill:tdd /skill:tdd ',
  );
});

test('double slash searches the complete skill files', async () => {
  const user = userEvent.setup();
  renderTaskComposer();

  const composer = within(document.body).getByRole('textbox');
  await user.type(composer, '//');

  assert.ok(
    within(document.body).getByText('Full skill search · //'),
  );
  assert.equal(
    within(document.body).getAllByRole('option').length,
    skills.length,
  );
  assert.equal(
    within(document.body)
      .getByRole('button', { name: 'Send task' })
      .hasAttribute('disabled'),
    true,
  );
});

test('double slash finds text that only exists inside a skill file', async () => {
  const user = userEvent.setup();
  renderTaskComposer();

  const composer = within(document.body).getByRole('textbox');
  await user.type(composer, '// roving');

  assert.ok(
    within(document.body).getByRole('option', {
      name: /\/skill:interface-review/u,
    }),
  );
});

test('a new Agent draft can find a skill despite a typing mistake', async () => {
  const user = userEvent.setup();
  render(
    <TaskComposer
      {...newSessionDepthProps}
      modelBusy={false}
      models={[]}
      skills={skills}
      selectedCwd="/workspace/ernie"
      selectedModelKey={null}
      selectedSessionId={null}
      changeModel={() => undefined}
      createAgentWithTask={async () => ({ ok: true })}
    />,
  );

  const composer = within(document.body).getByRole('textbox');
  await user.type(composer, '/interfce');

  assert.ok(
    within(document.body).getByRole('option', {
      name: /\/skill:interface-review/u,
    }),
  );
});

test('a new Agent starts only after its first non-empty task', async () => {
  const submissions: Array<{ cwd: string; message: string }> = [];
  const user = userEvent.setup();
  render(
    <TaskComposer
      {...newSessionDepthProps}
      modelBusy={false}
      models={[]}
      skills={skills}
      selectedCwd="/workspace/ernie"
      selectedModelKey={null}
      selectedSessionId={null}
      changeModel={() => undefined}
      createAgentWithTask={async (cwd, message) => {
        submissions.push({ cwd, message });
        return { ok: true };
      }}
    />,
  );

  const composer = within(document.body).getByRole('textbox');
  assert.equal(document.activeElement, composer);
  assert.equal(
    within(document.body).queryByRole('button', { name: 'Add context' }),
    null,
  );
  assert.equal(
    within(document.body).queryByRole('button', { name: 'Model' }),
    null,
  );
  assert.equal(
    within(document.body)
      .getByRole('button', { name: 'Send task' })
      .hasAttribute('disabled'),
    true,
  );
  await user.type(composer, '   {Enter}');
  assert.deepEqual(submissions, []);

  await user.clear(composer);
  await user.type(composer, 'Polish the sidebar{Enter}');

  await waitFor(() =>
    assert.deepEqual(submissions, [
      { cwd: '/workspace/ernie', message: 'Polish the sidebar' },
    ]),
  );
});

test('a failed Agent start keeps the first task draft', async () => {
  const user = userEvent.setup();
  render(
    <TaskComposer
      {...newSessionDepthProps}
      modelBusy={false}
      models={[]}
      skills={skills}
      selectedCwd="/workspace/ernie"
      selectedModelKey={null}
      selectedSessionId={null}
      changeModel={() => undefined}
      createAgentWithTask={async () => ({
        ok: false,
        message: 'Prime Agent is unavailable.',
      })}
    />,
  );

  const composer = within(document.body).getByRole('textbox');
  await user.type(composer, 'Keep this draft{Enter}');

  await waitFor(() =>
    assert.equal(
      within(document.body).getByRole('status').textContent,
      'Prime Agent is unavailable.',
    ),
  );
  assert.equal(
    within(document.body).getByRole('status').classList.contains('sr-only'),
    false,
  );
  assert.equal((composer as HTMLTextAreaElement).value, 'Keep this draft');
});

test('restores a separate persisted draft for each space', async () => {
  const user = userEvent.setup();
  const renderSpace = (selectedCwd: string) =>
    render(
      <TaskComposer
        {...newSessionDepthProps}
        modelBusy={false}
        models={[]}
        skills={skills}
        selectedCwd={selectedCwd}
        selectedModelKey={null}
        selectedSessionId={null}
        changeModel={() => undefined}
        createAgentWithTask={async () => ({ ok: true })}
      />,
    );

  renderSpace('/workspace/ernie');
  await user.type(within(document.body).getByRole('textbox'), 'Ernie draft');
  cleanup();

  renderSpace('/workspace/leslie');
  const leslieComposer = within(document.body).getByRole('textbox');
  assert.equal((leslieComposer as HTMLTextAreaElement).value, '');
  await user.type(leslieComposer, 'Leslie draft');
  cleanup();

  renderSpace('/workspace/ernie');
  assert.equal(
    (within(document.body).getByRole('textbox') as HTMLTextAreaElement).value,
    'Ernie draft',
  );
});
