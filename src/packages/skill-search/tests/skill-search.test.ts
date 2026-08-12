import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createSkillSearch,
  parseSkillQuery,
  replaceSkillQuery,
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

test('recognizes isolated and repeated skill-search hotkeys', () => {
  assert.deepEqual(parseSkillQuery('/'), {
    kind: 'full-text',
    start: 0,
    term: '',
  });
  assert.deepEqual(parseSkillQuery('/skill:'), {
    kind: 'full-text',
    start: 0,
    term: '',
  });
  assert.deepEqual(parseSkillQuery('/interface'), {
    kind: 'full-text',
    start: 0,
    term: 'interface',
  });
  assert.deepEqual(parseSkillQuery('/skill:tdd'), {
    kind: 'full-text',
    start: 0,
    term: 'tdd',
  });
  assert.deepEqual(parseSkillQuery('//'), {
    kind: 'single-vector',
    start: 0,
    term: '',
  });
  assert.deepEqual(parseSkillQuery('// help me review accessibility'), {
    kind: 'single-vector',
    start: 0,
    term: 'help me review accessibility',
  });
  assert.deepEqual(parseSkillQuery('/skill:tdd /inter'), {
    kind: 'full-text',
    start: 11,
    term: 'inter',
  });
  assert.equal(parseSkillQuery('use /tdd'), null);
  assert.equal(parseSkillQuery('/tdd now'), null);
});

test('replaces only the newest skill query', () => {
  const draft = '/skill:tdd /inter';
  const query = parseSkillQuery(draft);
  assert.ok(query);

  assert.equal(
    replaceSkillQuery(draft, query, '/skill:interface-review'),
    '/skill:tdd /skill:interface-review ',
  );
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
