import { MicIcon, PlusIcon } from 'lucide-react';

import { CurrentWorkspace } from '@/components/current-workspace';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
          loadingWorkspace={workspace.loadingWorkspace}
          selectedCwd={workspace.selectedCwd}
          changeFolder={workspace.changeFolder}
          changeGitBranch={workspace.changeGitBranch}
          deleteGitBranch={workspace.deleteGitBranch}
          renameGitBranch={workspace.renameGitBranch}
          initializeGitRepository={workspace.initializeGitRepository}
        />

        <InputGroup className="min-h-40 rounded-2xl bg-card">
          <InputGroupTextarea
            id="task"
            rows={4}
            className="select-text px-4 pt-4 text-base"
            placeholder="Plan, Build, / for skills, @ for context"
          />
          <InputGroupAddon align="block-end" className="px-4 pb-[13px]">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <InputGroupButton
                size="icon-sm"
                className="size-9 rounded-full bg-muted text-foreground"
                aria-label="Add context"
              >
                <PlusIcon />
              </InputGroupButton>

              <Select
                items={workspace.models.map((model) => ({
                  label: model.name,
                  value: model.key,
                }))}
                value={workspace.selectedModelKey}
                onValueChange={workspace.changeModel}
              >
                <SelectTrigger
                  size="sm"
                  className="max-w-56 border-0 bg-transparent px-2 text-sm shadow-none"
                  aria-label="Model"
                  disabled={workspace.busy || workspace.models.length === 0}
                >
                  <SelectValue placeholder="No model" />
                </SelectTrigger>
                <SelectContent
                  className="max-h-72"
                  align="start"
                  alignItemWithTrigger={false}
                >
                  <SelectGroup>
                    {workspace.models.map((model) => (
                      <SelectItem key={model.key} value={model.key}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

            </div>

            <InputGroupButton
              size="icon-sm"
              className="size-9 rounded-full bg-foreground text-background hover:bg-foreground/85 hover:text-background"
              aria-label="Use voice input"
            >
              <MicIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

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
            <SelectLabel className="sr-only">
              Multitask, RLM maximum depth
            </SelectLabel>
            <SelectTrigger
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
