import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createAgentRendererClients,
  type AgentRendererTransport,
} from '../index.js';
import type { JsonValue } from '../../json-value/index.js';

const model = {
  id: 'gpt-5.6',
  name: 'GPT-5.6',
  provider: 'openai',
  thinkingLevels: ['low', 'medium', 'high'],
} as const;
const session = {
  activeSessionId: 'agent-one',
  activity: 'idle',
  cwd: '/work/ernie',
  model: null,
  modifiedAt: '2026-08-16T05:00:00.000Z',
  name: 'Agent one',
  sessionPath: '/sessions/agent-one.jsonl',
} as const;
const configuration = {
  availableThinkingLevels: ['low', 'medium', 'high'],
  model,
  thinkingLevel: 'medium',
} as const;
const branches = {
  cwd: '/work/ernie',
  current: 'feature/calm',
  names: ['feature/calm', 'main'],
} as const;

function successfulTransport(): AgentRendererTransport {
  return {
    watchAgentWorkspace: () => 'workspace-feed',
    unwatchAgentWorkspace: () => undefined,
    createAgentSession: async () => ({ ok: true, value: session }),
    listAgentSavedSessions: async () => ({
      ok: true,
      value: [{
        activity: 'idle',
        cwd: session.cwd,
        messageCount: 2,
        modifiedAt: session.modifiedAt,
        name: session.name,
        path: session.sessionPath,
      }],
    }),
    importAgentSession: async () => ({ ok: true, value: session }),
    renameAgentSession: async () => ({
      ok: true,
      value: { name: 'Renamed Agent' },
    }),
    listAgentModels: async () => ({ ok: true, value: [model] }),
    getAgentConfiguration: async () => ({
      ok: true,
      value: configuration,
    }),
    listAgentSkills: async () => ({
      ok: true,
      value: [{
        command: '/skill:review',
        content: 'Review the code.',
        description: 'Review code.',
        name: 'review',
      }],
    }),
    watchAgentSession: () => 'session-feed',
    unwatchAgentSession: () => undefined,
    loadAgentSessionHistory: async () => ({
      ok: true,
      value: { activeSessionId: session.activeSessionId, start: 0, transcript: [] },
    }),
    setAgentModel: async () => ({ ok: true, value: configuration }),
    setAgentThinkingLevel: async () => ({ ok: true, value: configuration }),
    getAgentRlmDepth: async () => ({
      ok: true,
      value: { maxDepth: 2, source: 'chat' },
    }),
    setAgentRlmDepth: async () => ({
      ok: true,
      value: { maxDepth: 3, source: 'chat' },
    }),
    submitAgentTask: async () => ({
      ok: true,
      value: { accepted: true },
    }),
    refineAgentSession: async () => ({
      ok: true,
      value: { refined: true },
    }),
    listGitBranches: async () => ({ ok: true, value: branches }),
    readGitWorkspace: async () => ({
      ok: true,
      value: {
        branchName: branches.current,
        cwd: branches.cwd,
        repositoryCwd: branches.cwd,
      },
    }),
    switchGitBranch: async () => ({ ok: true, value: branches }),
    deleteGitBranch: async () => ({ ok: true, value: branches }),
    renameGitBranch: async () => ({ ok: true, value: branches }),
    initializeGit: async () => ({ ok: true, value: branches }),
    createGitWorktree: async () => ({
      ok: true,
      value: { branchName: 'feature/calm', cwd: '/work/ernie-calm' },
    }),
    chooseWorkspaceDirectory: async () => '/work/new',
  };
}

test('parses every renderer operation before returning it to callers', async () => {
  const { agent, localWorkspace } = createAgentRendererClients(
    successfulTransport(),
  );
  const results = await Promise.all([
    agent.createSession({ cwd: session.cwd, rlmMaxDepth: 2 }),
    agent.listSavedSessions(),
    agent.importSession(session.sessionPath),
    agent.renameSession({
      kind: 'live',
      activeSessionId: session.activeSessionId,
      name: 'Renamed Agent',
      sessionPath: session.sessionPath,
    }),
    agent.listModels({ kind: 'draft' }),
    agent.getConfiguration(session.activeSessionId),
    agent.listSkills(session.activeSessionId),
    agent.loadHistory({ activeSessionId: session.activeSessionId, before: 2 }),
    agent.setModel({
      activeSessionId: session.activeSessionId,
      modelId: model.id,
      provider: model.provider,
    }),
    agent.setThinkingLevel({
      activeSessionId: session.activeSessionId,
      thinkingLevel: 'medium',
    }),
    agent.getRlmDepth(session.activeSessionId),
    agent.setRlmDepth({
      activeSessionId: session.activeSessionId,
      maxDepth: 3,
    }),
    agent.submitTask({
      activeSessionId: session.activeSessionId,
      message: 'Review the boundary.',
    }),
    agent.refineSession({
      activeSessionId: session.activeSessionId,
      instructions: null,
    }),
    localWorkspace.listBranches(session.cwd),
    localWorkspace.readWorkspace(session.cwd),
    localWorkspace.switchBranch({ cwd: session.cwd, name: 'main' }),
    localWorkspace.deleteBranch({ cwd: session.cwd, name: 'feature/old' }),
    localWorkspace.renameBranch({
      cwd: session.cwd,
      currentName: 'feature/calm',
      newName: 'feature/calm-ui',
    }),
    localWorkspace.initializeGit(session.cwd),
    localWorkspace.createWorktree({ cwd: session.cwd, branchName: 'feature/calm' }),
  ]);

  assert.equal(results.every((result) => result.ok), true);
  const branchResult = results[14];
  assert.equal(branchResult?.ok, true);
  if (branchResult?.ok) {
    assert.deepEqual(branchResult.value.names, ['main', 'feature/calm']);
  }
  assert.deepEqual(await localWorkspace.chooseDirectory(), {
    ok: true,
    value: '/work/new',
  });
});

test('turns malformed responses and feed events into typed protocol failures', async () => {
  let workspaceListener: (value: JsonValue) => void = () => undefined;
  let sessionListener: (value: JsonValue) => void = () => undefined;
  const transport = successfulTransport();
  const clients = createAgentRendererClients({
    ...transport,
    listAgentModels: async () => ({ nope: true }),
    watchAgentWorkspace: (listener) => {
      workspaceListener = listener;
      return 'workspace-feed';
    },
    watchAgentSession: (_activeSessionId, listener) => {
      sessionListener = listener;
      return 'session-feed';
    },
  });
  const workspaceResults: unknown[] = [];
  const sessionResults: unknown[] = [];
  clients.agent.watchWorkspace((result) => workspaceResults.push(result));
  clients.agent.watchSession(session.activeSessionId, (result) =>
    sessionResults.push(result)
  );

  workspaceListener({ invalid: true });
  sessionListener({ invalid: true });
  const modelResult = await clients.agent.listModels({ kind: 'draft' });

  assert.equal(modelResult.ok, false);
  assert.equal(workspaceResults.length, 1);
  assert.equal(sessionResults.length, 1);
  assert.equal((workspaceResults[0] as { ok: boolean }).ok, false);
  assert.equal((sessionResults[0] as { ok: boolean }).ok, false);
});

test('closes the exact subscription once and ignores late feed events', () => {
  const stopped: string[] = [];
  let listener: (value: JsonValue) => void = () => undefined;
  const transport = successfulTransport();
  const clients = createAgentRendererClients({
    ...transport,
    watchAgentWorkspace: (nextListener) => {
      listener = nextListener;
      return 'workspace-owned';
    },
    unwatchAgentWorkspace: (subscriptionId) => stopped.push(subscriptionId),
  });
  const results: unknown[] = [];
  const subscription = clients.agent.watchWorkspace((result) =>
    results.push(result)
  );

  listener({ kind: 'connection-changed', status: 'ready' });
  subscription.close();
  subscription.close();
  listener({ kind: 'connection-changed', status: 'unavailable' });

  assert.deepEqual(stopped, ['workspace-owned']);
  assert.equal(results.length, 1);
});

test('preserves transport rejection and directory cancellation', async () => {
  const transport = successfulTransport();
  const rejected = new Error('transport unavailable');
  const clients = createAgentRendererClients({
    ...transport,
    listAgentSavedSessions: async () => Promise.reject(rejected),
    chooseWorkspaceDirectory: async () => null,
  });

  await assert.rejects(clients.agent.listSavedSessions(), rejected);
  assert.deepEqual(await clients.localWorkspace.chooseDirectory(), {
    ok: true,
    value: null,
  });
});
