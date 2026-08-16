import { RefreshCwIcon } from 'lucide-react';

import { AgentChat } from '@/components/agent-chat';
import { CurrentWorkspace } from '@/components/current-workspace';
import { TaskComposer } from '@/components/task-composer';
import { Field, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/trovecn/ui/button';
import type { PrimeAgentRendererClient } from '@/packages/agent-renderer-client';
import type { AgentWorkspaceController } from '@/packages/agent-workspace';
import type { ThinkingOrbState } from '@/thinking-orb-preference';

interface TaskSurfaceProps {
  readonly agentClient: PrimeAgentRendererClient;
  readonly onRetryConnection: () => void;
  readonly thinkingOrbState: ThinkingOrbState;
  readonly workspace: AgentWorkspaceController;
}

/** Ernie's primary task input and its connected execution environment. */
export function TaskSurface({
  agentClient,
  onRetryConnection,
  thinkingOrbState,
  workspace,
}: TaskSurfaceProps): React.JSX.Element {
  const { composer, connection, conversation, git, navigation } = workspace;
  const selectedSessionView =
    conversation.selectedSessionView?.activeSessionId ===
    navigation.selectedSessionId
      ? conversation.selectedSessionView
      : null;
  const chatVisible = selectedSessionView !== null;
  const agentUnavailable = connection.primeAgentConnection === 'unavailable';

  return (
    <div
      className={
        chatVisible
          ? 'flex h-full min-h-0 w-full flex-col'
          : 'w-full py-[clamp(1.5rem,5vh,3.5rem)]'
      }
    >
      <Field
        className={`mx-auto w-full gap-2 ${chatVisible ? 'min-h-0 max-w-none flex-1' : 'max-w-[62rem]'}`}
      >
        <FieldLabel htmlFor="task" className="sr-only">
          Give Ernie a task
        </FieldLabel>

        {navigation.selectedSessionId === null ? (
          <div className="flex flex-col gap-6">
            <header className="relative pb-6 after:absolute after:bottom-0 after:left-0 after:h-px after:w-32 after:rounded-full after:bg-gradient-to-r after:from-primary/60 after:via-primary/20 after:to-transparent">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Ernie
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                An experiment in jellyware: an RLM-able interface that follows
                the work
              </p>
            </header>
            <CurrentWorkspace
              busy={navigation.busy || agentUnavailable}
              disabled={agentUnavailable}
              folders={navigation.folders}
              gitBranch={git.gitBranch}
              gitBranchBusy={git.gitBranchBusy}
              gitBranches={git.gitBranches}
              gitWorktreeError={git.gitWorktreeError}
              loadingWorkspace={connection.loadingWorkspace}
              selectedCwd={navigation.selectedCwd}
              changeFolder={navigation.changeFolder}
              chooseWorkspaceDirectory={navigation.chooseWorkspaceDirectory}
              changeGitBranch={git.changeGitBranch}
              deleteGitBranch={git.deleteGitBranch}
              initializeGitRepository={git.initializeGitRepository}
              createGitWorktree={git.createGitWorktree}
            />
          </div>
        ) : selectedSessionView !== null ? (
          <div className="min-h-0 w-full flex-1 overflow-hidden">
            <AgentChat
              loadingEarlierHistory={conversation.loadingEarlierHistory}
              onLoadEarlierHistory={conversation.loadEarlierSessionHistory}
              onOpenSpawnedSession={conversation.openSpawnedSession}
              sessionView={selectedSessionView}
              thinkingOrbState={thinkingOrbState}
            />
          </div>
        ) : null}

        <div
          className={
            chatVisible
              ? 'mx-auto w-full max-w-[44rem] shrink-0 bg-background/95 pt-3 pb-1 backdrop-blur-sm'
              : undefined
          }
        >
          <TaskComposer
            agentClient={agentClient}
            key={`${navigation.selectedCwd ?? 'no-workspace'}:${
              navigation.selectedSessionId ?? 'new'
            }`}
            modelBusy={composer.modelBusy}
            depth={
              navigation.selectedSessionId === null
                ? composer.rlmMaxDepth
                : composer.selectedSessionRlmMaxDepth
            }
            depthBusy={
              navigation.selectedSessionId === null
                ? composer.rlmMaxDepthBusy
                : composer.selectedSessionRlmMaxDepthBusy
            }
            isGenerating={selectedSessionView?.isStreaming ?? false}
            models={composer.models}
            skills={composer.skills}
            selectedCwd={navigation.selectedCwd}
            selectedModelKey={composer.selectedModelKey}
            selectedSessionId={navigation.selectedSessionId}
            selectedThinkingLevel={composer.selectedThinkingLevel}
            thinkingLevelBusy={composer.thinkingLevelBusy}
            thinkingLevels={composer.thinkingLevels}
            disabled={agentUnavailable}
            changeModel={composer.changeModel}
            changeThinkingLevel={composer.changeThinkingLevel}
            createAgentWithTask={composer.createAgentWithTask}
            onDepthChange={
              navigation.selectedSessionId === null
                ? composer.changeRlmMaxDepth
                : composer.changeSelectedSessionRlmMaxDepth
            }
          />
        </div>

        {agentUnavailable ? (
          <div
            className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground"
            role="status"
          >
            <span>Prime Agent is unavailable.</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 px-2 text-xs text-foreground"
              onClick={onRetryConnection}
            >
              <RefreshCwIcon aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : null}
      </Field>

      <p id="workspace-status" className="sr-only" role="status">
        {connection.status}
      </p>
    </div>
  );
}
