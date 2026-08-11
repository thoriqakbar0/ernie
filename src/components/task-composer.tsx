import { ArrowUpIcon, PlusIcon } from 'lucide-react';
import { memo, useId, useMemo, useRef, useState } from 'react';

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
  | 'skills'
  | 'selectedCwd'
  | 'selectedModelKey'
  | 'selectedSessionId'
  | 'changeModel'
  | 'createAgentWithTask'
>;

/** Compose and submit one task without rerendering workspace controls. */
export const TaskComposer = memo(function TaskComposer({
  modelBusy,
  models,
  skills,
  selectedCwd,
  selectedModelKey,
  selectedSessionId,
  changeModel,
  createAgentWithTask,
}: TaskComposerProps): React.JSX.Element {
  const task = usePrimeAgentTask(
    selectedSessionId,
    selectedCwd,
    createAgentWithTask,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const skillsListId = useId();
  const [activeSkillIndex, setActiveSkillIndex] = useState(0);
  const [skillsDismissed, setSkillsDismissed] = useState(false);
  const skillQuery = skillSearchQuery(task.draft);
  const matchingSkills = useMemo(
    () =>
      skillQuery === null
        ? []
        : skills
            .filter((skill) =>
              `${skill.name} ${skill.description ?? ''}`
                .toLocaleLowerCase()
                .includes(skillQuery),
            )
            .slice(0, 6),
    [skillQuery, skills],
  );
  const skillsOpen = !skillsDismissed && matchingSkills.length > 0;

  function insertSkill(command: string): void {
    task.changeDraft(`${command} `);
    setSkillsDismissed(true);
    textareaRef.current?.focus();
  }

  function changeDraft(message: string): void {
    task.changeDraft(message);
    setActiveSkillIndex(0);
    setSkillsDismissed(false);
  }

  function handleComposerKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (event.nativeEvent.isComposing) return;

    if (skillsOpen && event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSkillIndex((current) => (current + 1) % matchingSkills.length);
      return;
    }

    if (skillsOpen && event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSkillIndex(
        (current) =>
          (current - 1 + matchingSkills.length) % matchingSkills.length,
      );
      return;
    }

    if (skillsOpen && event.key === 'Escape') {
      event.preventDefault();
      setSkillsDismissed(true);
      return;
    }

    if (skillsOpen && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const selectedSkill = matchingSkills[activeSkillIndex];
      if (selectedSkill !== undefined) insertSkill(selectedSkill.command);
      return;
    }

    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function submitTask(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    task.submit();
  }

  return (
    <>
      <form onSubmit={submitTask}>
        <InputGroup className="min-h-40 rounded-2xl bg-card">
          {skillsOpen ? (
            <div
              id={skillsListId}
              role="listbox"
              aria-label="Available skills"
              className="absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
            >
              <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Skills
              </p>
              {matchingSkills.map((skill, index) => (
                <button
                  id={`${skillsListId}-${index}`}
                  key={skill.command}
                  type="button"
                  role="option"
                  aria-selected={index === activeSkillIndex}
                  className="flex w-full min-w-0 items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent aria-selected:bg-accent"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertSkill(skill.command)}
                  onMouseEnter={() => setActiveSkillIndex(index)}
                >
                  <code className="shrink-0 text-sm text-foreground">
                    {skill.command}
                  </code>
                  {skill.description === null ? null : (
                    <span className="truncate text-sm text-muted-foreground">
                      {skill.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : null}

          <InputGroupTextarea
            ref={textareaRef}
            id="task"
            autoFocus={selectedSessionId === null && selectedCwd !== null}
            rows={4}
            value={task.draft}
            className="select-text px-4 pt-4 text-base"
            placeholder="Plan, Build, / for skills, @ for context"
            aria-autocomplete="list"
            aria-controls={skillsOpen ? skillsListId : undefined}
            aria-expanded={skillsOpen}
            aria-activedescendant={
              skillsOpen ? `${skillsListId}-${activeSkillIndex}` : undefined
            }
            onChange={(event) => changeDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
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

function skillSearchQuery(draft: string): string | null {
  const match = /^\/(?:skill:)?([^\s]*)$/u.exec(draft);
  return match?.[1]?.toLocaleLowerCase() ?? null;
}
