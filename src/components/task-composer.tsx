import { ArrowUpIcon, PlusIcon } from 'lucide-react';
import { memo } from 'react';

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
import type { PrimeAgentWorkspaceController } from '@/hooks/use-prime-agent-workspace';
import { usePrimeAgentTask } from '@/hooks/use-prime-agent-task';

type TaskComposerProps = Pick<
  PrimeAgentWorkspaceController,
  | 'modelBusy'
  | 'models'
  | 'selectedModelKey'
  | 'selectedSessionId'
  | 'changeModel'
>;

/** Compose and submit one task without rerendering workspace controls. */
export const TaskComposer = memo(function TaskComposer({
  modelBusy,
  models,
  selectedModelKey,
  selectedSessionId,
  changeModel,
}: TaskComposerProps): React.JSX.Element {
  const task = usePrimeAgentTask(selectedSessionId);

  function submitTask(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    task.submit();
  }

  return (
    <>
      <form onSubmit={submitTask}>
        <InputGroup className="min-h-40 rounded-2xl bg-card">
          <InputGroupTextarea
            id="task"
            rows={4}
            value={task.draft}
            className="select-text px-4 pt-4 text-base"
            placeholder="Plan, Build, / for skills, @ for context"
            onChange={(event) => task.changeDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== 'Enter' ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              ) {
                return;
              }
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
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
                items={models.map((model) => ({
                  label: model.name,
                  value: model.key,
                }))}
                value={selectedModelKey}
                onValueChange={changeModel}
              >
                <SelectTrigger
                  size="sm"
                  className="max-w-56 border-0 bg-transparent px-2 text-sm shadow-none"
                  aria-label="Model"
                  disabled={modelBusy || models.length === 0}
                >
                  <SelectValue placeholder="No model" />
                </SelectTrigger>
                <SelectContent
                  className="max-h-72"
                  align="start"
                  alignItemWithTrigger={false}
                >
                  <SelectGroup>
                    {models.map((model) => (
                      <SelectItem key={model.key} value={model.key}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <InputGroupButton
              type="submit"
              size="icon-sm"
              className="size-9 rounded-full bg-foreground text-background hover:bg-foreground/85 hover:text-background"
              aria-label="Send task"
              title="Send task (Enter)"
              disabled={!task.canSubmit || task.submitting}
            >
              <ArrowUpIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>

      <p className="sr-only" role="status">
        {task.status}
      </p>
    </>
  );
});
