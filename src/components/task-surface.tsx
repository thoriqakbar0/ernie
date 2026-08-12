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

  return (
    <div
      className={
        chatReady ? 'flex h-full min-h-0 w-full flex-col' : 'my-auto w-full'
      }
    >
      <Field
        className={`mx-auto w-full gap-2 ${chatReady ? 'min-h-0 max-w-[44rem] flex-1' : 'max-w-[50rem]'}`}
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
                {selectedSession?.name ?? 'Agent'}
              </h1>
              <span>{workspace.repoName}</span>
              {workspace.gitBranch === null ? null : <span>· {workspace.gitBranch}</span>}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <AgentChat
                depth={workspace.selectedSessionRlmMaxDepth}
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
