import { CurrentWorkspace } from '@/components/current-workspace';
import { RlmDepthPicker } from '@/components/rlm-depth-picker';
import { TaskComposer } from '@/components/task-composer';
import { Field, FieldLabel } from '@/components/ui/field';
import { usePrimeAgentWorkspace } from '@/hooks/use-prime-agent-workspace';

/** Ernie's primary task input and its connected execution environment. */
export function TaskSurface(): React.JSX.Element {
  const workspace = usePrimeAgentWorkspace();

  return (
    <div className="my-auto w-full">
      <Field className="mx-auto max-w-[50rem] gap-2">
        <FieldLabel htmlFor="task" className="sr-only">
          Give Ernie a task
        </FieldLabel>

        <CurrentWorkspace
          busy={workspace.busy}
          folders={workspace.folders}
          gitBranch={workspace.gitBranch}
          gitBranchBusy={workspace.gitBranchBusy}
          gitBranches={workspace.gitBranches}
          gitWorktreeError={workspace.gitWorktreeError}
          loadingWorkspace={workspace.loadingWorkspace}
          selectedCwd={workspace.selectedCwd}
          changeFolder={workspace.changeFolder}
          chooseWorkspaceDirectory={workspace.chooseWorkspaceDirectory}
          changeGitBranch={workspace.changeGitBranch}
          deleteGitBranch={workspace.deleteGitBranch}
          renameGitBranch={workspace.renameGitBranch}
          initializeGitRepository={workspace.initializeGitRepository}
          createGitWorktree={workspace.createGitWorktree}
        />

        <TaskComposer
          busy={workspace.busy}
          models={workspace.models}
          selectedModelKey={workspace.selectedModelKey}
          selectedSessionId={workspace.selectedSessionId}
          changeModel={workspace.changeModel}
        />

        <div className="flex flex-wrap items-center gap-3">
          <RlmDepthPicker
            busy={workspace.busy}
            depth={workspace.rlmDepth}
            onDepthChange={workspace.changeRlmDepth}
          />
        </div>
      </Field>

      <p id="workspace-status" className="sr-only" role="status">
        {workspace.status}
      </p>
    </div>
  );
}
