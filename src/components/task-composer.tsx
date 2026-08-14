import { ArrowUpIcon } from 'lucide-react';
import { memo, useId, useMemo, useRef, useState } from 'react';

import { RlmDepthPicker } from '@/components/rlm-depth-picker';
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
import {
  createSkillSearch,
  parseSkillQuery,
  replaceSkillQuery,
} from '@/packages/skill-search';

type TaskComposerProps = Pick<
  PrimeAgentWorkspaceController,
  | 'modelBusy'
  | 'models'
  | 'skills'
  | 'selectedCwd'
  | 'selectedModelKey'
  | 'selectedSessionId'
  | 'selectedSessionRlmMaxDepth'
  | 'selectedSessionRlmMaxDepthBusy'
  | 'changeModel'
  | 'changeSelectedSessionRlmMaxDepth'
  | 'createAgentWithTask'
> & {
  readonly disabled?: boolean;
  readonly isGenerating?: boolean;
};

/** Compose and submit one task without rerendering workspace controls. */
export const TaskComposer = memo(function TaskComposer({
  disabled = false,
  isGenerating = false,
  modelBusy,
  models,
  skills,
  selectedCwd,
  selectedModelKey,
  selectedSessionId,
  selectedSessionRlmMaxDepth,
  selectedSessionRlmMaxDepthBusy,
  changeModel,
  changeSelectedSessionRlmMaxDepth,
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
  const skillQuery = parseSkillQuery(task.draft);
  const searchSkills = useMemo(() => createSkillSearch(skills), [skills]);
  const skillQueryKind = skillQuery?.kind ?? null;
  const skillQueryTerm = skillQuery?.term ?? '';
  const matchingSkills = useMemo(
    () => (skillQuery === null ? [] : searchSkills(skillQueryTerm, 6)),
    [searchSkills, skillQueryKind, skillQueryTerm],
  );
  const skillsOpen =
    !skillsDismissed && skillQuery !== null && matchingSkills.length > 0;

  function insertSkill(command: string): void {
    if (skillQuery === null) return;
    task.changeDraft(replaceSkillQuery(task.draft, skillQuery, command));
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

    if (
      skillsOpen &&
      matchingSkills.length > 0 &&
      event.key === 'ArrowDown'
    ) {
      event.preventDefault();
      setActiveSkillIndex((current) => (current + 1) % matchingSkills.length);
      return;
    }

    if (
      skillsOpen &&
      matchingSkills.length > 0 &&
      event.key === 'ArrowUp'
    ) {
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

    if (
      event.key === 'Enter' &&
      event.altKey &&
      isGenerating &&
      selectedSessionId !== null
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      return;
    }

    if (
      skillsOpen &&
      matchingSkills.length > 0 &&
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault();
      const selectedSkill = matchingSkills[activeSkillIndex];
      if (selectedSkill !== undefined) insertSkill(selectedSkill.command);
      return;
    }

    if (
      skillQueryKind === 'deep-full-text' &&
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter' && event.shiftKey) {
      if (selectedSessionId === null || isGenerating) return;
      event.preventDefault();
      task.refine();
      return;
    }

    if (event.key !== 'Enter') return;
    if (isGenerating && selectedSessionId !== null) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function submitTask(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (skillQueryKind === 'deep-full-text') return;
    task.submit();
  }

  return (
    <>
      <form onSubmit={submitTask} aria-disabled={disabled}>
        <InputGroup
          className={`min-h-14 items-end rounded-2xl bg-card p-2 shadow-sm transition-opacity has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0 ${disabled ? 'opacity-45' : ''}`}
        >
          {skillsOpen ? (
            <div
              id={skillsListId}
              role="listbox"
              aria-label="Available skills"
              className="absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
            >
              <div className="flex items-center justify-between gap-3 px-3 py-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Skills
                </p>
                {skillQueryKind === 'deep-full-text' ? (
                  <span className="text-[10px] text-muted-foreground/70">
                    Full skill search · //
                  </span>
                ) : null}
              </div>
              <div
                data-slot="skill-results"
                className="max-h-56 overflow-y-auto overscroll-contain"
              >
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
            </div>
          ) : null}

          <InputGroupTextarea
            ref={textareaRef}
            id="task"
            data-focus-outline="none"
            autoFocus={selectedSessionId === null && selectedCwd !== null}
            rows={1}
            value={task.draft}
            className="max-h-28 min-h-9 select-text px-3 py-2 text-base focus-visible:border-0 focus-visible:outline-none [field-sizing:content]"
            placeholder={isGenerating ? 'Add a follow-up…' : 'Ask Prime Agent…'}
            aria-autocomplete="list"
            aria-controls={skillsOpen ? skillsListId : undefined}
            aria-expanded={skillsOpen}
            aria-keyshortcuts={
              selectedSessionId === null
                ? undefined
                : isGenerating
                  ? 'Alt+Enter'
                  : 'Shift+Enter'
            }
            title={
              selectedSessionId === null
                ? undefined
                : isGenerating
                  ? 'Option+Enter to queue'
                  : 'Enter to send · Shift+Enter to refine'
            }
            disabled={disabled}
            aria-activedescendant={
              skillsOpen && matchingSkills.length > 0
                ? `${skillsListId}-${activeSkillIndex}`
                : undefined
            }
            onChange={(event) => changeDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
          />
          <InputGroupAddon align="inline-end" className="h-9 self-end p-0">
            <InputGroupButton
              type="submit"
              size="icon-sm"
              className="size-8 rounded-full bg-foreground text-background hover:bg-foreground/85 hover:text-background"
              aria-label={isGenerating ? 'Queue task' : 'Send task'}
              title={
                isGenerating ? 'Queue task (⌥↵)' : 'Send task (Enter)'
              }
              disabled={
                disabled ||
                !task.canSubmit ||
                task.submitting ||
                skillQueryKind === 'deep-full-text'
              }
            >
              <ArrowUpIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        {selectedSessionId === null ? null : (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1 text-xs text-muted-foreground">
            {task.submitting ? (
              <span className="basis-full px-2 text-center font-medium text-foreground/70 min-[30rem]:basis-auto">
                {task.status}
              </span>
            ) : isGenerating ? (
              <span className="basis-full px-2 text-center font-medium text-foreground/70 min-[30rem]:basis-auto">
                Working · follow-ups queue
              </span>
            ) : null}
            {models.length === 0 ? null : (
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
                  className="h-7 max-w-56 border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none"
                  aria-label="Model"
                  disabled={modelBusy}
                >
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent
                  className="max-h-72"
                  align="center"
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
            )}
            {selectedSessionRlmMaxDepth === null ? null : (
              <RlmDepthPicker
                busy={disabled || selectedSessionRlmMaxDepthBusy}
                compact
                depth={selectedSessionRlmMaxDepth}
                onDepthChange={changeSelectedSessionRlmMaxDepth}
              />
            )}
          </div>
        )}
      </form>

      <p className="sr-only" role="status">
        {task.status}
      </p>
    </>
  );
});
