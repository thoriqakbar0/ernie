import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createSkillSearch,
  parseSkillQuery,
} from '@/packages/skill-search';

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
  {
    command: '/skill:research',
    description: null,
    name: 'research',
  },
] as const;

test('recognizes only isolated skill-search hotkeys', () => {
  assert.deepEqual(parseSkillQuery('/'), { kind: 'full-text', term: '' });
  assert.deepEqual(parseSkillQuery('/skill:'), {
    kind: 'full-text',
    term: '',
  });
  assert.deepEqual(parseSkillQuery('/interface'), {
    kind: 'full-text',
    term: 'interface',
  });
  assert.deepEqual(parseSkillQuery('/skill:tdd'), {
    kind: 'full-text',
    term: 'tdd',
  });
  assert.deepEqual(parseSkillQuery('//'), {
    kind: 'single-vector',
    term: '',
  });
  assert.deepEqual(parseSkillQuery('// help me review accessibility'), {
    kind: 'single-vector',
    term: 'help me review accessibility',
  });
  assert.equal(parseSkillQuery('use /tdd'), null);
  assert.equal(parseSkillQuery('/tdd now'), null);
});

test('ranks skill names, commands, and descriptions with typo tolerance', () => {
  const search = createSkillSearch(skills);

  assert.equal(search('interfce', 6)[0]?.name, 'interface-review');
  assert.equal(search('write', 6)[0]?.name, 'tdd');
  assert.deepEqual(
    search('', 2).map((skill) => skill.name),
    ['interface-review', 'tdd'],
  );
});

test('limits skill results without mutating the source catalog', () => {
  const search = createSkillSearch(skills);

  assert.equal(search('', 1).length, 1);
  assert.equal(skills.length, 3);
});
