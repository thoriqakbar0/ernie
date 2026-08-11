import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { cleanup, render, within } from '@testing-library/react';
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

afterEach(cleanup);

function renderTaskComposer(): void {
  render(
    <TaskComposer
      modelBusy={false}
      models={[]}
      skills={skills}
      selectedModelKey={null}
      selectedSessionId="active-agent"
      changeModel={() => undefined}
    />,
  );
}

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

test('user can select a detected skill with the keyboard', async () => {
  const user = userEvent.setup();
  renderTaskComposer();

  const composer = within(document.body).getByRole('textbox');
  await user.type(composer, '/');
  await user.keyboard('{ArrowDown}{Enter}');

  assert.equal((composer as HTMLTextAreaElement).value, '/skill:tdd ');
});
