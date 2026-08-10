import { CurrentWorkspace } from '@/components/current-workspace';
import { TaskComposer } from '@/components/task-composer';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePrimeAgentWorkspace } from '@/hooks/use-prime-agent-workspace';

const rlmDepthChoices = Array.from({ length: 9 }, (_, maxDepth) => ({
  label: `RLM ${maxDepth}`,
  value: String(maxDepth),
}));

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
          <Button
            variant="outline"
            className="rounded-full text-sm font-normal"
          >
            Plan New Idea
            <span className="text-muted-foreground">⇧Tab</span>
          </Button>

          <Select
            items={rlmDepthChoices}
            value={
              workspace.rlmDepth === null ? null : String(workspace.rlmDepth)
            }
            onValueChange={workspace.changeRlmDepth}
          >
            <SelectTrigger
              aria-label="RLM maximum depth"
              className="w-auto rounded-full px-4 text-sm"
              disabled={workspace.busy || workspace.rlmDepth === null}
            >
              <span>Multitask</span>
              {workspace.rlmDepth === null ? null : (
                <>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                  <SelectValue className="flex-none tabular-nums text-muted-foreground" />
                </>
              )}
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              <SelectGroup>
                {rlmDepthChoices.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </Field>

      <p id="workspace-status" className="sr-only" role="status">
        {workspace.status}
      </p>
    </div>
  );
}
