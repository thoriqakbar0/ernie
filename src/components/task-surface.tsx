import { ArrowUpIcon, CpuIcon, GitForkIcon } from 'lucide-react';

import { CurrentWorkspace } from '@/components/current-workspace';
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
    <div className="w-full self-center">
      <div className="mx-auto mb-10 max-w-[27.5625rem] text-center">
        <h1 className="text-balance text-2xl font-medium tracking-tight sm:text-3xl">
          Move {workspace.repoName} forward.
        </h1>
      </div>

      <Field className="relative z-10 mx-auto max-w-[43rem]">
        <FieldLabel htmlFor="task" className="sr-only">
          Give Ernie a task
        </FieldLabel>
        <InputGroup className="min-h-25">
          <InputGroupTextarea
            id="task"
            rows={2}
            placeholder="Give Ernie a task…"
          />
          <InputGroupAddon align="block-end" className="justify-between">
            <div className="flex min-w-0 items-center gap-1.5">
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
                  className="max-w-48"
                  aria-label="Model"
                  disabled={workspace.busy || workspace.models.length === 0}
                >
                  <CpuIcon />
                  <SelectValue placeholder="No model" />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  <SelectGroup>
                    {workspace.models.map((model) => (
                      <SelectItem key={model.key} value={model.key}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Select
                items={rlmDepthChoices}
                value={
                  workspace.rlmDepth === null
                    ? null
                    : String(workspace.rlmDepth)
                }
                onValueChange={workspace.changeRlmDepth}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="RLM maximum depth"
                  disabled={workspace.busy || workspace.rlmDepth === null}
                >
                  <GitForkIcon />
                  <SelectValue placeholder="RLM" />
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

            <InputGroupButton size="icon-sm" aria-label="Start agent">
              <ArrowUpIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>

      <div className="relative z-0 -mt-2.5">
        <CurrentWorkspace
          folders={workspace.folders}
          loadingWorkspace={workspace.loadingWorkspace}
          selectedCwd={workspace.selectedCwd}
          changeFolder={workspace.changeFolder}
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {workspace.status}
      </p>
    </div>
  );
}
