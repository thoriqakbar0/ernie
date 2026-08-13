import { RefreshCwIcon } from 'lucide-react';

import { AgentChat } from '@/components/agent-chat';
import { CurrentWorkspace } from '@/components/current-workspace';
import { JellywareLanding } from '@/components/jellyware-landing';
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
  const selectedSessionView =
    workspace.selectedSessionView?.activeSessionId ===
    workspace.selectedSessionId
      ? workspace.selectedSessionView
      : null;
  const chatVisible = selectedSessionView !== null;
  const agentUnavailable = workspace.primeAgentConnection === 'unavailable';

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

        {workspace.selectedSessionId === null ? (
          <div className="flex flex-col gap-6">
            <JellywareLanding />
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
          </div>
        ) : selectedSessionView !== null ? (
          <div className="min-h-0 w-full flex-1 overflow-y-auto">
            <AgentChat
              onOpenSpawnedSession={workspace.openSpawnedSession}
              sessionView={selectedSessionView}
            />
          </div>
        ) : null}

        <div
          className={
            chatVisible
              ? 'mx-auto w-full max-w-[48rem] shrink-0 bg-background/95 pt-3 pb-1 backdrop-blur-sm'
              : undefined
          }
        >
          <TaskComposer
            key={`${workspace.selectedCwd ?? 'no-workspace'}:${
              workspace.selectedSessionId ?? 'new'
            }`}
            modelBusy={workspace.modelBusy}
            isGenerating={selectedSessionView?.isStreaming ?? false}
            models={workspace.models}
            skills={workspace.skills}
            selectedCwd={workspace.selectedCwd}
            selectedModelKey={workspace.selectedModelKey}
            selectedSessionId={workspace.selectedSessionId}
            selectedSessionRlmMaxDepth={workspace.selectedSessionRlmMaxDepth}
            selectedSessionRlmMaxDepthBusy={
              workspace.selectedSessionRlmMaxDepthBusy
            }
            disabled={agentUnavailable}
            changeModel={workspace.changeModel}
            changeSelectedSessionRlmMaxDepth={
              workspace.changeSelectedSessionRlmMaxDepth
            }
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
