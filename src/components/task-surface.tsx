import { CurrentWorkspace } from '@/components/current-workspace';
import { TaskComposer } from '@/components/task-composer';
import { Field, FieldLabel } from '@/components/ui/field';
import type { PrimeAgentWorkspaceController } from '@/hooks/use-prime-agent-workspace';

interface TaskSurfaceProps {
  readonly workspace: PrimeAgentWorkspaceController;
}

/** Ernie's primary task input and its connected execution environment. */
export function TaskSurface({ workspace }: TaskSurfaceProps): React.JSX.Element {
  return (
    <div className="my-auto w-full">
      <Field className="mx-auto max-w-[50rem] gap-2">
        <FieldLabel htmlFor="task" className="sr-only">
          Give Ernie a task
        </FieldLabel>

        {workspace.selectedSessionId === null ? (
          <CurrentWorkspace
            busy={workspace.busy}
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
        ) : null}

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
          changeModel={workspace.changeModel}
          createAgentWithTask={workspace.createAgentWithTask}
        />
      </Field>

      <p id="workspace-status" className="sr-only" role="status">
        {workspace.status}
      </p>
    </div>
  );
}
