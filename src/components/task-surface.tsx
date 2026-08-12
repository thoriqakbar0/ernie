import { RefreshCwIcon } from 'lucide-react';

import { AgentChat } from '@/components/agent-chat';
import { CurrentWorkspace } from '@/components/current-workspace';
import { TaskComposer } from '@/components/task-composer';
import { Field, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/trovecn/ui/button';
import type { PrimeAgentWorkspaceController } from '@/hooks/use-prime-agent-workspace';

interface TaskSurfaceProps {
  readonly onRetryConnection: () => void;
  readonly workspace: PrimeAgentWorkspaceController;
}

/** Ernie's primary task input and its connected execution environment. */
export function TaskSurface({
  onRetryConnection,
  workspace,
}: TaskSurfaceProps): React.JSX.Element {
  const selectedSession = workspace.sessions.find(
    (session) => session.activeSessionId === workspace.selectedSessionId,
  );
  const selectedSessionView =
    workspace.selectedSessionView?.activeSessionId ===
    workspace.selectedSessionId
      ? workspace.selectedSessionView
      : null;
  const chatReady =
    selectedSessionView?.messages.some(
      (message) => message.role === 'assistant',
    ) ?? false;
  const agentUnavailable = workspace.primeAgentConnection === 'unavailable';
  const workingAgentCount =
    selectedSessionView?.spawnedSessions.filter(
      (session) => session.status === 'working' || session.status === 'queued',
    ).length ?? 0;

  return (
    <div
      className={
        chatReady ? 'flex min-h-full w-full flex-col' : 'my-auto w-full'
      }
    >
      <Field
        className={`mx-auto w-full gap-2 ${chatReady ? 'min-h-full max-w-[44rem] flex-1' : 'max-w-[50rem]'}`}
      >
        <FieldLabel htmlFor="task" className="sr-only">
          Give Ernie a task
        </FieldLabel>

        {workspace.selectedSessionId === null ? (
          <CurrentWorkspace
            busy={workspace.busy || agentUnavailable}
            disabled={agentUnavailable}
            folders={workspace.folders}
            gitBranch={workspace.gitBranch}
            gitBranchBusy={workspace.gitBranchBusy}
            gitBranches={workspace.gitBranches}
            gitWorktreeError={workspace.gitWorktreeError}
            loadingWorkspace={workspace.loadingWorkspace}
            rlmMaxDepth={workspace.rlmMaxDepth}
            rlmMaxDepthBusy={workspace.rlmMaxDepthBusy}
            selectedCwd={workspace.selectedCwd}
            changeFolder={workspace.changeFolder}
            chooseWorkspaceDirectory={workspace.chooseWorkspaceDirectory}
            changeGitBranch={workspace.changeGitBranch}
            changeRlmMaxDepth={workspace.changeRlmMaxDepth}
            deleteGitBranch={workspace.deleteGitBranch}
            initializeGitRepository={workspace.initializeGitRepository}
            createGitWorktree={workspace.createGitWorktree}
          />
        ) : chatReady && selectedSessionView !== null ? (
          <>
            <header className="flex items-center gap-2 border-b border-border/60 pb-2 text-xs text-muted-foreground">
              <h1 className="font-medium text-foreground">
                {selectedSessionView.sessionName ?? selectedSession?.name ?? 'Agent'}
              </h1>
              <span>{workspace.repoName}</span>
              {workspace.gitBranch === null ? null : <span>· {workspace.gitBranch}</span>}
              <span
                className={
                  workingAgentCount > 0 || selectedSessionView.isStreaming
                    ? 'ml-auto text-muted-foreground'
                    : 'ml-auto text-emerald-600 dark:text-emerald-400'
                }
              >
                {workingAgentCount > 0
                  ? `${workingAgentCount} working`
                  : selectedSessionView.isStreaming
                    ? 'working'
                    : 'done'}
              </span>
            </header>
            <div className="min-h-0 flex-1">
              <AgentChat
                depth={workspace.selectedSessionRlmMaxDepth}
                onOpenSpawnedSession={workspace.openSpawnedSession}
                sessionView={selectedSessionView}
              />
            </div>
          </>
        ) : (
          <p className="text-center text-xs text-muted-foreground" role="status">
            {selectedSession?.activity === 'working' ||
            selectedSession?.activity === 'queued'
              ? 'Agent working'
              : 'Waiting for the first response'}
          </p>
        )}

        <div
          className={
            chatReady
              ? 'sticky bottom-0 z-10 -mx-2 bg-background/95 px-2 pt-3 pb-1 backdrop-blur-sm'
              : undefined
          }
        >
          <TaskComposer
            key={`${workspace.selectedCwd ?? 'no-workspace'}:${
              workspace.selectedSessionId ?? 'new'
            }`}
            modelBusy={workspace.modelBusy}
            models={workspace.models}
            skills={workspace.skills}
            selectedCwd={workspace.selectedCwd}
            selectedModelKey={workspace.selectedModelKey}
            selectedSessionId={workspace.selectedSessionId}
            selectedSessionRlmMaxDepth={workspace.selectedSessionRlmMaxDepth}
            disabled={agentUnavailable}
            changeModel={workspace.changeModel}
            createAgentWithTask={workspace.createAgentWithTask}
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
        {workspace.status}
      </p>
    </div>
  );
}
