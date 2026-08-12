import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AgentPluginViewContext } from '@/packages/agent-plugin-context';
import {
  aiChatPluginManifest,
  aiChatPluginViewId,
} from '@/packages/ai-chat-plugin';
import { createAiChatPluginModule } from '@/packages/ai-chat-plugin/view';
import { createPluginHost } from '@/packages/plugin-host';
import {
  subagentsPluginManifest,
  subagentsPluginViewId,
} from '@/packages/subagents-plugin';
import { createSubagentsPluginModule } from '@/packages/subagents-plugin/view';

const context: AgentPluginViewContext = {
  onOpenSpawnedSession: () => undefined,
  sessionView: {
    activeSessionId: 'root',
    isStreaming: false,
    messages: [{ id: 'answer', role: 'assistant', text: 'ready' }],
    rlmMaxDepth: 2,
    sessionName: 'Ready',
    spawnedSessions: [],
    transcript: [
      { id: 'answer', kind: 'message', role: 'assistant', text: 'ready' },
    ],
  },
};

test('activates AI Chat and Subagents as ordered Agent plugins', async () => {
  const created = createPluginHost([
    createAiChatPluginModule(() => context),
    createSubagentsPluginModule(() => context),
  ]);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.deepEqual(created.value.listPlugins(), [
    aiChatPluginManifest,
    subagentsPluginManifest,
  ]);
  assert.deepEqual(
    created.value.listViews().map((view) => [view.id, view.location]),
    [
      [aiChatPluginViewId, 'agent'],
      [subagentsPluginViewId, 'agent'],
    ],
  );
  assert.equal((await created.value.renderView(aiChatPluginViewId)).ok, true);
  assert.equal((await created.value.renderView(subagentsPluginViewId)).ok, true);
});
