import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TaskComposer } from '@/components/task-composer';

const skills = [
  {
    command: '/skill:interface-review',
    description: 'Review a user interface.',
    name: 'interface-review',
  },
  {
    command: '/skill:tdd',
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

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderTaskComposer(): void {
  render(
    <TaskComposer
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

test('session controls appear for a connected Agent', () => {
  renderTaskComposer();

  assert.ok(
    within(document.body).getByRole('button', { name: 'Add context' }),
  );
  assert.ok(within(document.body).getByRole('combobox', { name: 'Model' }));
});

test('connected Agent uses the compact quick composer', () => {
  renderTaskComposer();

  const composer = within(document.body).getByRole('textbox');
  assert.equal(composer.getAttribute('rows'), '1');
  assert.equal(composer.getAttribute('placeholder'), 'Ask Prime Agent…');
});

test('working Agent keeps an editable follow-up queue', async () => {
  const user = userEvent.setup();
  render(
    <TaskComposer
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
  const workingStatus = within(document.body).getByText(
    'Working · follow-ups queue',
  );
  assert.match(workingStatus.className, /basis-full/u);

  await user.type(composer, 'Review the tests next');
  assert.equal(
    (composer as HTMLTextAreaElement).value,
    'Review the tests next',
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

test('double slash opens natural-language skill search', async () => {
  const user = userEvent.setup();
  renderTaskComposer();

  const composer = within(document.body).getByRole('textbox');
  await user.type(composer, '//');

  assert.ok(
    within(document.body).getByText('Natural language · //'),
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

test('a new Agent draft can find a skill despite a typing mistake', async () => {
  const user = userEvent.setup();
  render(
    <TaskComposer
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
  assert.equal((composer as HTMLTextAreaElement).value, 'Keep this draft');
});

test('restores a separate persisted draft for each space', async () => {
  const user = userEvent.setup();
  const renderSpace = (selectedCwd: string) =>
    render(
      <TaskComposer
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
