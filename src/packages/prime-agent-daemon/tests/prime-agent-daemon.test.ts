import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Deferred, Effect, Fiber, Stream } from 'effect';

import { createSkillSearch } from '@/packages/skill-search';

import {
  parsePrimeAgentGitBranchesResult,
  parsePrimeAgentGitWorkspaceResult,
  parsePrimeAgentGitWorktreeResult,
} from '../git-client';
import {
  parsePrimeAgentModelsResult,
  parsePrimeAgentRefinementReceiptResult,
  parsePrimeAgentRlmDepthResult,
  parsePrimeAgentSavedSessionsResult,
  parsePrimeAgentSessionResult,
  parsePrimeAgentSessionViewResult,
  parsePrimeAgentSkillsResult,
  parsePrimeAgentTaskReceiptResult,
  parsePrimeAgentWorkspaceResult,
} from '../client';
import {
  createPrimeAgentDaemon,
  parsePrimeAgentDaemonCreatedSession,
  parsePrimeAgentDaemonModels,
  parsePrimeAgentDaemonRefinementRequest,
  parsePrimeAgentDaemonSavedSessions,
  parsePrimeAgentDaemonSessions,
  parsePrimeAgentDaemonSessionView,
  parsePrimeAgentDaemonSkillResources,
} from '../server';

test('projects focused chat messages and named spawned sessions', () => {
  const raw = {
    snapshot: {
      activeSessionId: 'root-agent',
      messages: [
        { role: 'user', content: 'Build the chat' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I am working on it.' },
            {
              type: 'toolCall',
              id: 'cell-1',
              name: 'ipython',
              arguments: { code: 'value = 6 * 7\nvalue' },
            },
          ],
        },
        {
          role: 'toolResult',
          toolCallId: 'cell-1',
          toolName: 'ipython',
          content: [{ type: 'text', text: '42' }],
          isError: false,
          details: {
            attachments: [
              {
                data: 'aW1hZ2U=',
                mimeType: 'image/png',
                path: '/tmp/chart.png',
              },
            ],
            durationMs: 18,
            status: 'ok',
            stdout: 'calculated\n',
            result: '42',
          },
        },
      ],
      state: { isStreaming: false, sessionName: 'Build transcript' },
      children: [
        {
          id: 'research',
          activeSessionId: 'research-active',
          sessionName: 'Research protocol',
          label: 'fallback label',
          status: 'running',
          durationMs: 1200,
          recap: 'Reading protocol types',
          activity: { kind: 'executing', toolName: 'ipython' },
        },
        {
          id: 'tests',
          parentId: 'research',
          sessionName: 'Verify behavior',
          label: 'fallback label',
          status: 'done',
        },
        {
          id: 'unnamed',
          label: 'Do not render this',
          status: 'queued',
        },
      ],
    },
  };
  const expected = {
    ok: true,
    value: {
      activeSessionId: 'root-agent',
      isStreaming: false,
      messages: [
        { id: 'root-agent:0', role: 'user', text: 'Build the chat' },
        { id: 'root-agent:1', role: 'assistant', text: 'I am working on it.' },
      ],
      rlmMaxDepth: 2,
      sessionName: 'Build transcript',
      transcript: [
        {
          id: 'root-agent:0',
          kind: 'message',
          role: 'user',
          text: 'Build the chat',
        },
        {
          id: 'root-agent:1:text:0',
          kind: 'message',
          role: 'assistant',
          text: 'I am working on it.',
        },
        {
          attachments: [
            {
              data: 'aW1hZ2U=',
              mimeType: 'image/png',
              path: '/tmp/chart.png',
            },
          ],
          code: 'value = 6 * 7\nvalue',
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
      spawnedSessions: [
        {
          activeSessionId: 'research-active',
          activity: 'ipython',
          durationMs: 1200,
          error: null,
          id: 'research',
          name: 'Research protocol',
          parentId: null,
          recap: 'Reading protocol types',
          status: 'working',
        },
        {
          activeSessionId: null,
          activity: null,
          durationMs: null,
          error: null,
          id: 'tests',
          name: 'Verify behavior',
          parentId: 'research',
          recap: null,
          status: 'done',
        },
      ],
    },
  };

  assert.deepEqual(
    parsePrimeAgentDaemonSessionView(raw, { maxDepth: 2, source: 'chat' }),
    expected,
  );
  assert.deepEqual(parsePrimeAgentSessionViewResult(expected), expected);
});
import {
  createLocalGitWorktree,
  deleteLocalGitBranch,
  initializeLocalGitRepository,
  readLocalGitBranches,
  readLocalGitWorkspace,
  renameLocalGitBranch,
  switchLocalGitBranch,
} from '../git-server';

const execFileAsync = promisify(execFile);
const primeAgentCliPath = join(
  process.cwd(),
  'node_modules/prime-agent/dist/bundle/cli.js',
);

function runGit(args: readonly string[]) {
  return Effect.tryPromise(() =>
    execFileAsync('git', [...args], { encoding: 'utf8' }),
  );
}

const createGitRepository = Effect.fn('Test.createGitRepository')(
  function* (cwd: string) {
    yield* runGit(['init', '--initial-branch', 'feature/local', cwd]);
    yield* runGit([
      '-C',
      cwd,
      '-c',
      'user.name=Ernie Test',
      '-c',
      'user.email=ernie@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'Initial commit',
    ]);
  },
);

function testInTempDirectory(
  name: string,
  prefix: string,
  use: (cwd: string) => Effect.Effect<void, unknown>,
): void {
  test(name, () =>
    Effect.runPromise(
      Effect.acquireUseRelease(
        Effect.tryPromise(() => mkdtemp(join(tmpdir(), prefix))),
        use,
        (cwd) =>
          Effect.tryPromise(() =>
            rm(cwd, {
              force: true,
              maxRetries: 5,
              recursive: true,
              retryDelay: 25,
            }),
          ).pipe(Effect.orDie),
      ),
    ),
  );
}

function testEffect(name: string, effect: Effect.Effect<void, unknown>): void {
  test(name, () => Effect.runPromise(effect));
}

testInTempDirectory(
  'starts Prime Agent and searches its real skill catalog',
  'ernie-prime-agent-',
  (cwd) => {
    const socketPath = join(cwd, 'prime-agent.sock');
    const sessionDirectoryPath = join(cwd, 'sessions');
    const daemon = createPrimeAgentDaemon({
      currentCwd: cwd,
      daemonEntrypointPath: primeAgentCliPath,
      executablePath: process.execPath,
      sessionNameExtensionPath: join(
        process.cwd(),
        'src/packages/session-name-hook/index.ts',
      ),
      sessionDirectoryPath,
      socketPath,
    });

    const shutdown = Effect.tryPromise(async () => {
      const { DaemonClient } = await import('prime-agent');
      const client = new DaemonClient(socketPath);
      try {
        await client.connect(1_000);
        await client.request({ type: 'shutdown', force: true }, 3_000);
      } finally {
        client.close();
        daemon.close();
      }
    }).pipe(Effect.catch(() => Effect.sync(() => daemon.close())));

    return Effect.gen(function* () {
      const skillDirectory = join(
        cwd,
        '.prime/agent/skills/interface-audit',
      );
      yield* Effect.tryPromise(() => mkdir(skillDirectory, { recursive: true }));
      yield* Effect.tryPromise(() =>
        writeFile(
          join(skillDirectory, 'SKILL.md'),
          [
            '---',
            'name: interface-audit',
            'description: Inspect interface hierarchy.',
            '---',
            '',
            'Inspect the interface hierarchy.',
          ].join('\n'),
          'utf8',
        ),
      );

      const coldResults = yield* Effect.all(
        [daemon.listWorkspace(), daemon.listWorkspace()],
        { concurrency: 'unbounded' },
      );
      const warmResult = yield* daemon.listWorkspace();

      const expected = {
        ok: true,
        value: { currentCwd: cwd, sessions: [] },
      } as const;
      assert.deepEqual(coldResults, [expected, expected]);
      assert.deepEqual(warmResult, expected);

      const created = yield* daemon.createSession({ cwd, rlmMaxDepth: 3 });
      assert.equal(created.ok, true);
      if (!created.ok) return;

      const initialFeedItem = yield* Deferred.make<void>();
      const renamedFeedItem = yield* Deferred.make<void>();
      const feedFiber = yield* daemon
        .sessionFeed(created.value.activeSessionId)
        .pipe(
          Stream.runForEach((item) => {
            if (item.kind === 'snapshot') {
              return Deferred.succeed(initialFeedItem, undefined);
            }
            if (
              item.kind === 'session-name-changed' &&
              item.sessionName === 'Streamed Agent'
            ) {
              return Deferred.succeed(renamedFeedItem, undefined);
            }
            return Effect.void;
          }),
          Effect.forkChild,
        );
      yield* Effect.gen(function* () {
        yield* Deferred.await(initialFeedItem).pipe(Effect.timeout('5 seconds'));
        const renamed = yield* daemon.renameSession({
          kind: 'live',
          activeSessionId: created.value.activeSessionId,
          sessionPath: null,
          name: 'Streamed Agent',
        });
        assert.deepEqual(renamed, {
          ok: true,
          value: { name: 'Streamed Agent' },
        });
        yield* Deferred.await(renamedFeedItem).pipe(Effect.timeout('5 seconds'));
      }).pipe(Effect.ensuring(Fiber.interrupt(feedFiber)));

      const depth = yield* daemon.getRlmDepth(created.value.activeSessionId);
      assert.deepEqual(depth, {
        ok: true,
        value: { maxDepth: 3, source: 'chat' },
      });
      const savedSessionFiles = yield* Effect.tryPromise(() =>
        readdir(sessionDirectoryPath),
      );
      assert.equal(
        savedSessionFiles.filter((name) => name.endsWith('.jsonl')).length,
        1,
      );

      const skills = yield* daemon.listSkills(created.value.activeSessionId);
      assert.equal(skills.ok, true);
      if (!skills.ok) return;
      assert.ok(skills.value.some((skill) => skill.name === 'interface-audit'));
      assert.ok(
        skills.value.some(
          (skill) =>
            skill.name === 'interface-audit' &&
            skill.content.includes('Inspect the interface hierarchy.'),
        ),
      );

      const searchSkills = createSkillSearch(skills.value);
      assert.ok(
        searchSkills('interface-audt', 6).some(
          (skill) => skill.name === 'interface-audit',
        ),
      );
    }).pipe(Effect.ensuring(shutdown));
  },
);

test('keeps active or connected top-level daemon sessions', () => {
  const result = parsePrimeAgentDaemonSessions({
    sessions: [
      {
        activeSessionId: 'root-active',
        activity: 'working',
        attachedClients: 1,
        cwd: '/workspace/ernie',
        runtimeKind: 'top-level',
        sessionActions: { queuedCount: 0 },
        sessionFile: '/sessions/root-active.jsonl',
        firstMessage: 'Build the desktop',
        modified: '2026-08-10T10:00:00.000Z',
        model: {
          id: 'gpt-5.6-sol',
          name: 'GPT-5.6 Sol',
          provider: 'openai-codex',
        },
      },
      {
        activeSessionId: 'root-detached',
        activity: 'idle',
        attachedClients: 0,
        cwd: '/workspace/ernie',
        runtimeKind: 'top-level',
        sessionActions: { queuedCount: 0 },
      },
      {
        activeSessionId: 'root-running-detached',
        activity: 'working',
        attachedClients: 0,
        cwd: '/workspace/ernie',
        runtimeKind: 'top-level',
        sessionActions: { queuedCount: 0 },
        firstMessage: 'Keep the running chat visible',
      },
      {
        activeSessionId: 'child-active',
        activity: 'working',
        attachedClients: 1,
        cwd: '/workspace/ernie',
        runtimeKind: 'subagent',
        sessionActions: { queuedCount: 0 },
      },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    value: [
      {
        activeSessionId: 'root-active',
        activity: 'working',
        cwd: '/workspace/ernie',
        name: 'Build the desktop',
        model: {
          key: '["openai-codex","gpt-5.6-sol"]',
          id: 'gpt-5.6-sol',
          name: 'GPT-5.6 Sol',
          provider: 'openai-codex',
        },
        modifiedAt: '2026-08-10T10:00:00.000Z',
        sessionPath: '/sessions/root-active.jsonl',
      },
      {
        activeSessionId: 'root-running-detached',
        activity: 'working',
        cwd: '/workspace/ernie',
        name: 'Keep the running chat visible',
        model: null,
        modifiedAt: null,
        sessionPath: null,
      },
    ],
  });
});

test('projects truthful live activity from Prime Agent summaries', () => {
  const result = parsePrimeAgentDaemonSessions({
    sessions: [
      {
        activeSessionId: 'working-agent',
        activity: 'working',
        attachedClients: 1,
        cwd: '/workspace/ernie',
        runtimeKind: 'top-level',
        sessionActions: { queuedCount: 0 },
      },
      {
        activeSessionId: 'queued-agent',
        activity: 'idle',
        attachedClients: 1,
        cwd: '/workspace/ernie',
        runtimeKind: 'top-level',
        sessionActions: { queuedCount: 2 },
      },
      {
        activeSessionId: 'attention-agent',
        activity: 'idle',
        attachedClients: 1,
        cwd: '/workspace/ernie',
        runtimeKind: 'top-level',
        sessionActions: { queuedCount: 0 },
        taskState: 'needs_input',
      },
      {
        activeSessionId: 'idle-agent',
        activity: 'idle',
        attachedClients: 1,
        cwd: '/workspace/ernie',
        runtimeKind: 'top-level',
        sessionActions: { queuedCount: 0 },
        taskState: 'completed',
      },
    ],
  });

  assert.deepEqual(
    result.ok
      ? result.value.map((session) => [
          session.activeSessionId,
          session.activity,
        ])
      : result,
    [
      ['working-agent', 'working'],
      ['queued-agent', 'queued'],
      ['attention-agent', 'needs_input'],
      ['idle-agent', 'settled'],
    ],
  );
});

test('keeps models from configured daemon providers', () => {
  const result = parsePrimeAgentDaemonModels({
    configuredProviders: ['openai-codex'],
    models: [
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', provider: 'openai-codex' },
      { id: 'claude-opus', name: 'Claude Opus', provider: 'anthropic' },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    value: [
      {
        key: '["openai-codex","gpt-5.6-sol"]',
        id: 'gpt-5.6-sol',
        name: 'GPT-5.6 Sol',
        provider: 'openai-codex',
      },
    ],
  });
});

test('parses a newly created detached session before Ernie attaches', () => {
  const result = parsePrimeAgentDaemonCreatedSession({
    activeSessionId: 'new-agent',
    activity: 'idle',
    attachedClients: 0,
    cwd: '/workspace/ernie',
    runtimeKind: 'top-level',
    sessionActions: { queuedCount: 0 },
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      activeSessionId: 'new-agent',
      activity: 'idle',
      cwd: '/workspace/ernie',
      name: 'New Agent',
      model: null,
      modifiedAt: null,
      sessionPath: null,
    },
  });
});

test('keeps and orders durable top-level Prime Agent sessions', () => {
  const result = parsePrimeAgentDaemonSavedSessions({
    sessions: [
      {
        cwd: '/workspace/ernie',
        firstMessage: 'Older session',
        id: 'older',
        messageCount: 4,
        modified: '2026-08-09T10:00:00.000Z',
        path: '/sessions/older.jsonl',
        taskState: 'completed',
      },
      {
        cwd: '/workspace/ernie',
        id: 'child',
        messageCount: 2,
        modified: '2026-08-11T10:00:00.000Z',
        parentSessionPath: '/sessions/newer.jsonl',
        path: '/sessions/child.jsonl',
        rlmDepth: 1,
      },
      {
        activity: 'idle',
        cwd: '/workspace/kastuli',
        firstMessage: 'Fallback message',
        id: 'newer',
        messageCount: 12,
        modified: '2026-08-10T10:00:00.000Z',
        name: 'Saved architecture review',
        path: '/sessions/newer.jsonl',
      },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    value: [
      {
        activity: 'idle',
        cwd: '/workspace/kastuli',
        messageCount: 12,
        modifiedAt: '2026-08-10T10:00:00.000Z',
        name: 'Saved architecture review',
        path: '/sessions/newer.jsonl',
      },
      {
        activity: 'settled',
        cwd: '/workspace/ernie',
        messageCount: 4,
        modifiedAt: '2026-08-09T10:00:00.000Z',
        name: 'Older session',
        path: '/sessions/older.jsonl',
      },
    ],
  });
});

test('uses a neutral title for an unnamed saved Agent', () => {
  const result = parsePrimeAgentDaemonSavedSessions({
    sessions: [
      {
        cwd: '/workspace/ernie',
        id: 'unnamed',
        messageCount: 0,
        modified: '2026-08-10T10:00:00.000Z',
        path: '/sessions/unnamed.jsonl',
      },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    value: [
      {
        activity: 'idle',
        cwd: '/workspace/ernie',
        messageCount: 0,
        modifiedAt: '2026-08-10T10:00:00.000Z',
        name: 'New Agent',
        path: '/sessions/unnamed.jsonl',
      },
    ],
  });
});

test('keeps and orders skill file references from the daemon', () => {
  const result = parsePrimeAgentDaemonSkillResources({
    skills: [
      {
        description: 'Write tests first.',
        filePath: '/skills/tdd/SKILL.md',
        name: 'tdd',
      },
      {
        description: 'Review a user interface.',
        filePath: '/skills/interface-review/SKILL.md',
        name: 'interface-review',
      },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    value: [
      {
        description: 'Review a user interface.',
        filePath: '/skills/interface-review/SKILL.md',
        name: 'interface-review',
      },
      {
        description: 'Write tests first.',
        filePath: '/skills/tdd/SKILL.md',
        name: 'tdd',
      },
    ],
  });
});

test('validates created sessions and skills after IPC', () => {
  assert.equal(
    parsePrimeAgentSessionResult({
      ok: true,
      value: {
        activeSessionId: 'new-agent',
        activity: 'idle',
        cwd: '/workspace/ernie',
        name: 'New Agent',
        model: null,
        modifiedAt: null,
        sessionPath: null,
      },
    }).ok,
    true,
  );
  assert.equal(
    parsePrimeAgentSavedSessionsResult({
      ok: true,
      value: [
        {
          activity: 'idle',
          cwd: '/workspace/ernie',
          messageCount: 4,
          modifiedAt: '2026-08-10T10:00:00.000Z',
          name: 'Saved architecture review',
          path: '/sessions/architecture.jsonl',
        },
      ],
    }).ok,
    true,
  );
  assert.equal(
    parsePrimeAgentSkillsResult({
      ok: true,
      value: [
        {
          command: '/skill:tdd',
          content: '# TDD\nWrite tests first.',
          description: null,
          name: 'tdd',
        },
      ],
    }).ok,
    true,
  );
  assert.equal(
    parsePrimeAgentSkillsResult({
      ok: true,
      value: [
        {
          command: '/skill:tdd',
          content: '# TDD',
          description: null,
          name: 'wrong',
        },
      ],
    }).ok,
    false,
  );
});

test('orders GPT models from the largest version first in the renderer', () => {
  const result = parsePrimeAgentModelsResult({
    ok: true,
    value: [
      {
        key: 'claude',
        id: 'claude-opus',
        name: 'Claude Opus',
        provider: 'anthropic',
      },
      {
        key: 'gpt-5.4',
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        provider: 'openai-codex',
      },
      {
        key: 'gpt-5.6',
        id: 'gpt-5.6',
        name: 'GPT-5.6 Sol',
        provider: 'openai-codex',
      },
    ],
  });

  assert.deepEqual(
    result.ok ? result.value.map((model) => model.name) : result,
    ['GPT-5.6 Sol', 'GPT-5.4', 'Claude Opus'],
  );
});

test('rejects malformed workspace data after IPC', () => {
  const result = parsePrimeAgentWorkspaceResult({
    ok: true,
    value: { currentCwd: '/workspace/ernie', sessions: [{}] },
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'protocol_error',
      message: 'Ernie received invalid daemon data.',
    },
  });
});

test('parses live RLM depth after IPC', () => {
  const result = parsePrimeAgentRlmDepthResult({
    ok: true,
    value: { maxDepth: 2, source: 'chat' },
  });

  assert.deepEqual(result, {
    ok: true,
    value: { maxDepth: 2, source: 'chat' },
  });
});

test('parses a task receipt after IPC', () => {
  const result = parsePrimeAgentTaskReceiptResult({
    ok: true,
    value: { accepted: true },
  });

  assert.deepEqual(result, {
    ok: true,
    value: { accepted: true },
  });
});

test('parses a continual-harness refinement across both IPC boundaries', () => {
  assert.deepEqual(
    parsePrimeAgentDaemonRefinementRequest({
      activeSessionId: 'active-agent',
      instructions: 'Keep the verified workflow.',
    }),
    {
      ok: true,
      value: {
        activeSessionId: 'active-agent',
        instructions: 'Keep the verified workflow.',
      },
    },
  );
  assert.deepEqual(
    parsePrimeAgentRefinementReceiptResult({
      ok: true,
      value: { refined: true },
    }),
    { ok: true, value: { refined: true } },
  );
});

test('parses local Git branches after IPC', () => {
  const result = parsePrimeAgentGitBranchesResult({
    ok: true,
    value: {
      cwd: '/workspace/ernie',
      current: 'main',
      names: ['feature/local', 'staging', 'main'],
    },
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      cwd: '/workspace/ernie',
      current: 'main',
      names: ['main', 'staging', 'feature/local'],
    },
  });
});

test('rejects inconsistent local Git branches after IPC', () => {
  const result = parsePrimeAgentGitBranchesResult({
    ok: true,
    value: {
      cwd: '/workspace/ernie',
      current: 'main',
      names: ['feature/local'],
    },
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'protocol_error',
      message: 'Ernie received invalid daemon data.',
    },
  });
});

test('parses a created Git worktree after IPC', () => {
  const result = parsePrimeAgentGitWorktreeResult({
    ok: true,
    value: {
      cwd: '/workspace/ernie-worktrees/feature/calm-ui',
      branchName: 'feature/calm-ui',
    },
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      cwd: '/workspace/ernie-worktrees/feature/calm-ui',
      branchName: 'feature/calm-ui',
    },
  });
});

test('parses linked Git workspace identity after IPC', () => {
  const result = parsePrimeAgentGitWorkspaceResult({
    ok: true,
    value: {
      branchName: 'feature/calm-ui',
      cwd: '/workspace/ernie-worktrees/feature/calm-ui',
      repositoryCwd: '/workspace/ernie',
    },
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      branchName: 'feature/calm-ui',
      cwd: '/workspace/ernie-worktrees/feature/calm-ui',
      repositoryCwd: '/workspace/ernie',
    },
  });
});

testInTempDirectory(
  'reads local branches through the Git process',
  'ernie-git-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* Effect.all(
        ['feature/second', 'main', 'staging'].map((name) =>
          runGit(['-C', cwd, 'branch', name]),
        ),
        { concurrency: 'unbounded', discard: true },
      );

      const result = yield* readLocalGitBranches(cwd);
      assert.deepEqual(result, {
        ok: true,
        value: {
          cwd,
          current: 'feature/local',
          names: ['feature/local', 'feature/second', 'main', 'staging'],
        },
      });
    }),
);

testInTempDirectory(
  'initializes a local Git repository with main',
  'ernie-git-init-',
  (cwd) =>
    Effect.gen(function* () {
      const firstResult = yield* initializeLocalGitRepository(cwd);
      const retryResult = yield* initializeLocalGitRepository(cwd);
      const expected = {
        ok: true,
        value: { cwd, current: 'main', names: ['main'] },
      };
      assert.deepEqual(firstResult, expected);
      assert.deepEqual(retryResult, expected);
    }),
);

testInTempDirectory(
  'switches to an existing local Git branch',
  'ernie-git-switch-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'branch', 'feature/second']);
      const result = yield* switchLocalGitBranch({
        cwd,
        name: 'feature/second',
      });
      assert.deepEqual(result, {
        ok: true,
        value: {
          cwd,
          current: 'feature/second',
          names: ['feature/local', 'feature/second'],
        },
      });
    }),
);

testInTempDirectory(
  'rejects a local Git branch that does not exist',
  'ernie-git-missing-branch-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      const result = yield* switchLocalGitBranch({ cwd, name: 'missing' });
      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'The selected local Git branch does not exist.',
        },
      });
    }),
);

testInTempDirectory(
  'deletes an existing merged local Git branch',
  'ernie-git-delete-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'branch', 'feature/merged']);
      const result = yield* deleteLocalGitBranch({
        cwd,
        name: 'feature/merged',
      });
      assert.deepEqual(result, {
        ok: true,
        value: { cwd, current: 'feature/local', names: ['feature/local'] },
      });
    }),
);

testInTempDirectory(
  'deletes a merged local branch and its clean linked worktree',
  'ernie-git-delete-worktree-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'branch', 'feature/merged']);
      const worktreeCwd = join(cwd, 'linked-worktree');
      yield* runGit([
        '-C',
        cwd,
        'worktree',
        'add',
        worktreeCwd,
        'feature/merged',
      ]);

      const result = yield* deleteLocalGitBranch({
        cwd,
        name: 'feature/merged',
      });

      assert.deepEqual(result, {
        ok: true,
        value: { cwd, current: 'feature/local', names: ['feature/local'] },
      });
      const worktrees = yield* runGit([
        '-C',
        cwd,
        'worktree',
        'list',
        '--porcelain',
      ]);
      assert.doesNotMatch(worktrees.stdout, /linked-worktree/u);
    }),
);

testInTempDirectory(
  'keeps a merged local branch when its linked worktree has changes',
  'ernie-git-keep-dirty-worktree-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'branch', 'feature/dirty']);
      const worktreeCwd = join(cwd, 'linked-worktree');
      yield* runGit([
        '-C',
        cwd,
        'worktree',
        'add',
        worktreeCwd,
        'feature/dirty',
      ]);
      yield* Effect.tryPromise(() =>
        writeFile(join(worktreeCwd, 'uncommitted.txt'), 'keep me', 'utf8'),
      );

      const result = yield* deleteLocalGitBranch({
        cwd,
        name: 'feature/dirty',
      });

      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'request_failed',
          message: 'Git could not delete the local branch.',
        },
      });
      const branches = yield* readLocalGitBranches(cwd);
      assert.equal(branches.ok && branches.value.names.includes('feature/dirty'), true);
      assert.equal(
        yield* Effect.tryPromise(() =>
          readdir(worktreeCwd).then((entries) => entries.includes('uncommitted.txt')),
        ),
        true,
      );
    }),
);

testInTempDirectory(
  'protects the main local Git branch from deletion',
  'ernie-git-protected-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'branch', 'main']);
      const result = yield* deleteLocalGitBranch({ cwd, name: 'main' });
      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'The selected local Git branch is protected.',
        },
      });
    }),
);

testInTempDirectory(
  'keeps an unmerged local Git branch',
  'ernie-git-unmerged-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'switch', '--create', 'feature/unmerged']);
      yield* runGit([
        '-C',
        cwd,
        '-c',
        'user.name=Ernie Test',
        '-c',
        'user.email=ernie@example.invalid',
        'commit',
        '--allow-empty',
        '-m',
        'Unmerged commit',
      ]);
      yield* runGit(['-C', cwd, 'switch', 'feature/local']);

      const result = yield* deleteLocalGitBranch({
        cwd,
        name: 'feature/unmerged',
      });
      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'request_failed',
          message: 'Git could not delete the local branch.',
        },
      });
      const branchResult = yield* runGit([
        '-C',
        cwd,
        'branch',
        '--list',
        'feature/unmerged',
      ]);
      assert.equal(branchResult.stdout.trim(), 'feature/unmerged');
    }),
);

testInTempDirectory(
  'renames the current local Git branch',
  'ernie-git-rename-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      const result = yield* renameLocalGitBranch({
        cwd,
        currentName: 'feature/local',
        newName: 'feature/renamed',
      });
      assert.deepEqual(result, {
        ok: true,
        value: {
          cwd,
          current: 'feature/renamed',
          names: ['feature/renamed'],
        },
      });
    }),
);

testInTempDirectory(
  'creates and reuses a branch-backed local Git worktree',
  'ernie-git-worktree-',
  (root) =>
    Effect.gen(function* () {
      const cwd = join(root, 'repository');
      yield* createGitRepository(cwd);

      const creation = { cwd, branchName: 'feature/calm-ui' };
      const firstResult = yield* createLocalGitWorktree(creation);
      const retryResult = yield* createLocalGitWorktree(creation);
      const canonicalRoot = yield* Effect.tryPromise(() => realpath(root));
      const worktreeCwd = join(
        canonicalRoot,
        'repository-worktrees',
        'feature',
        'calm-ui',
      );
      const expected = {
        ok: true,
        value: { cwd: worktreeCwd, branchName: 'feature/calm-ui' },
      };

      assert.deepEqual(firstResult, expected);
      assert.deepEqual(retryResult, expected);
      const workspace = yield* readLocalGitWorkspace(worktreeCwd);
      assert.deepEqual(workspace, {
        ok: true,
        value: {
          branchName: 'feature/calm-ui',
          cwd: worktreeCwd,
          repositoryCwd: join(canonicalRoot, 'repository'),
        },
      });
      const branch = yield* runGit([
        '-C',
        worktreeCwd,
        'branch',
        '--show-current',
      ]);
      assert.equal(branch.stdout.trim(), 'feature/calm-ui');

      const nestedCreation = yield* createLocalGitWorktree({
        cwd: worktreeCwd,
        branchName: 'feature/second',
      });
      assert.deepEqual(nestedCreation, {
        ok: true,
        value: {
          cwd: join(canonicalRoot, 'repository-worktrees', 'feature', 'second'),
          branchName: 'feature/second',
        },
      });
    }),
);

testInTempDirectory(
  'replaces a prunable local Git worktree instead of returning its missing path',
  'ernie-git-worktree-prunable-',
  (root) =>
    Effect.gen(function* () {
      const cwd = join(root, 'repository');
      yield* createGitRepository(cwd);

      const creation = { cwd, branchName: 'feature/stale' };
      const firstResult = yield* createLocalGitWorktree(creation);
      assert.equal(firstResult.ok, true);
      if (!firstResult.ok) return;

      const movedCwd = join(root, 'moved-stale-worktree');
      yield* Effect.tryPromise(() => rename(firstResult.value.cwd, movedCwd));
      const replacementResult = yield* createLocalGitWorktree(creation);

      assert.deepEqual(replacementResult, firstResult);
      const branch = yield* runGit([
        '-C',
        firstResult.value.cwd,
        'branch',
        '--show-current',
      ]);
      assert.equal(branch.stdout.trim(), 'feature/stale');
    }),
);

testInTempDirectory(
  'rejects an invalid Git worktree branch name',
  'ernie-git-worktree-invalid-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      const result = yield* createLocalGitWorktree({
        cwd,
        branchName: 'feature..invalid',
      });

      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'Use a valid Git branch name for the new worktree.',
        },
      });
    }),
);

testInTempDirectory(
  'requires a first commit before creating a Git worktree',
  'ernie-git-worktree-unborn-',
  (cwd) =>
    Effect.gen(function* () {
      yield* initializeLocalGitRepository(cwd);
      const result = yield* createLocalGitWorktree({
        cwd,
        branchName: 'feature/first',
      });

      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'Create the first commit before adding a worktree.',
        },
      });
    }),
);

testInTempDirectory(
  'refuses to overwrite an existing local Git branch',
  'ernie-git-rename-conflict-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'branch', 'feature/existing']);
      const result = yield* renameLocalGitBranch({
        cwd,
        currentName: 'feature/local',
        newName: 'feature/existing',
      });
      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'The new local Git branch already exists.',
        },
      });
    }),
);

testInTempDirectory(
  'protects the main local Git branch from renaming',
  'ernie-git-rename-protected-',
  (cwd) =>
    Effect.gen(function* () {
      yield* createGitRepository(cwd);
      yield* runGit(['-C', cwd, 'branch', 'main']);
      const result = yield* renameLocalGitBranch({
        cwd,
        currentName: 'main',
        newName: 'renamed-main',
      });
      assert.deepEqual(result, {
        ok: false,
        error: {
          code: 'invalid_request',
          message: 'The selected local Git branch is protected.',
        },
      });
    }),
);

testInTempDirectory(
  'returns no branch for a directory outside a Git repository',
  'ernie-no-git-',
  (cwd) =>
    Effect.gen(function* () {
      const result = yield* readLocalGitBranches(cwd);
      assert.deepEqual(result, {
        ok: true,
        value: { cwd, current: null, names: [] },
      });
    }),
);

testEffect(
  'rejects a missing workspace path before starting Git',
  Effect.gen(function* () {
    const cwd = join(tmpdir(), 'ernie-missing-workspace');
    const result = yield* readLocalGitBranches(cwd);
    assert.deepEqual(result, {
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'The workspace path is invalid.',
      },
    });
  }),
);
