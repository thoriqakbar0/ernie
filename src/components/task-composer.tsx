import { ArrowUpIcon, SearchIcon } from 'lucide-react';
import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';

import { EffortPicker } from '@/components/effort-picker';
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
  | 'selectedThinkingLevel'
  | 'thinkingLevelBusy'
  | 'thinkingLevels'
  | 'changeModel'
  | 'changeThinkingLevel'
  | 'createAgentWithTask'
> & {
  readonly depth: number | null;
  readonly depthBusy: boolean;
  readonly disabled?: boolean;
  readonly isGenerating?: boolean;
  readonly onDepthChange: (depth: string | null) => void;
};

/** Compose and submit one task without rerendering workspace controls. */
export const TaskComposer = memo(function TaskComposer({
  disabled = false,
  depth,
  depthBusy,
  isGenerating = false,
  modelBusy,
  models,
  skills,
  selectedCwd,
  selectedModelKey,
  selectedSessionId,
  selectedThinkingLevel,
  thinkingLevelBusy,
  thinkingLevels,
  changeModel,
  changeThinkingLevel,
  createAgentWithTask,
  onDepthChange,
}: TaskComposerProps): React.JSX.Element {
  const task = usePrimeAgentTask(
    selectedSessionId,
    selectedCwd,
    createAgentWithTask,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const skillSearchRef = useRef<HTMLInputElement>(null);
  const skillsPopupId = useId();
  const skillsListId = useId();
  const [activeSkillIndex, setActiveSkillIndex] = useState(0);
  const [skillsDismissed, setSkillsDismissed] = useState(false);
  const skillQuery = parseSkillQuery(task.draft);
  const searchSkills = useMemo(() => createSkillSearch(skills), [skills]);
  const skillQueryKind = skillQuery?.kind ?? null;
  const skillQueryTerm = skillQuery?.term ?? '';
  const matchingSkills = useMemo(
    () => (skillQuery === null ? [] : searchSkills(skillQueryTerm, 12)),
    [searchSkills, skillQueryKind, skillQueryTerm],
  );
  const skillsOpen = !skillsDismissed && skillQuery !== null;
  useEffect(() => {
    if (!skillsOpen || skillQueryKind !== 'deep-full-text') return;
    skillSearchRef.current?.focus();
  }, [skillQueryKind, skillsOpen]);

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

  function changeSkillSearch(term: string): void {
    if (skillQuery === null) return;
    const prefix = task.draft.slice(0, skillQuery.start);
    task.changeDraft(`${prefix}// ${term}`);
    setActiveSkillIndex(0);
  }

  function handleSkillSearchKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' && matchingSkills.length > 0) {
      event.preventDefault();
      setActiveSkillIndex((current) => (current + 1) % matchingSkills.length);
      return;
    }
    if (event.key === 'ArrowUp' && matchingSkills.length > 0) {
      event.preventDefault();
      setActiveSkillIndex(
        (current) =>
          (current - 1 + matchingSkills.length) % matchingSkills.length,
      );
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setSkillsDismissed(true);
      textareaRef.current?.focus();
      return;
    }
    if (event.key === 'Enter' && matchingSkills.length > 0) {
      event.preventDefault();
      const selectedSkill = matchingSkills[activeSkillIndex];
      if (selectedSkill !== undefined) insertSkill(selectedSkill.command);
    }
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

    if (event.key === 'Enter' && event.shiftKey) return;

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
              id={skillsPopupId}
              role="dialog"
              aria-label="Search skills"
              className="absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
            >
              <div className="border-b p-2">
                <label className="flex items-center gap-2 rounded-lg border bg-background px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
                  <SearchIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="sr-only">Search skills</span>
                  <input
                    ref={skillSearchRef}
                    type="search"
                    value={skillQueryTerm}
                    className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    placeholder="Search names, descriptions, and skill contents…"
                    aria-controls={skillsListId}
                    aria-activedescendant={
                      matchingSkills.length > 0
                        ? `${skillsListId}-${activeSkillIndex}`
                        : undefined
                    }
                    onChange={(event) => changeSkillSearch(event.target.value)}
                    onKeyDown={handleSkillSearchKeyDown}
                  />
                  <kbd className="hidden text-[10px] text-muted-foreground sm:inline">
                    esc
                  </kbd>
                </label>
                <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                  <span>
                    {matchingSkills.length === 0
                      ? 'No matching skills'
                      : `${matchingSkills.length} ${matchingSkills.length === 1 ? 'result' : 'results'}`}
                  </span>
                  <span>Searches complete skill files</span>
                </div>
              </div>
              <div
                id={skillsListId}
                role="listbox"
                aria-label="Available skills"
                data-slot="skill-results"
                className="max-h-64 overflow-y-auto overscroll-contain p-1"
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
            aria-controls={skillsOpen ? skillsPopupId : undefined}
            aria-expanded={skillsOpen}
            aria-keyshortcuts={
              isGenerating ? 'Alt+Enter Shift+Enter' : 'Enter Shift+Enter'
            }
            title={
              isGenerating
                ? 'Option+Enter to queue · Shift+Enter for newline'
                : 'Enter to send · Shift+Enter for newline'
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
          <InputGroupAddon
            align="block-end"
            className="justify-between gap-2 px-1.5 pb-1.5"
          >
            <div className="flex min-w-0 items-center gap-1">
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
                  disabled={modelBusy || models.length === 0}
                >
                  <SelectValue
                    placeholder={
                      modelBusy && models.length === 0
                        ? 'Loading models…'
                        : models.length === 0
                          ? 'Model unavailable'
                          : 'Model'
                    }
                  />
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
              <EffortPicker
                busy={disabled || thinkingLevelBusy}
                levels={thinkingLevels}
                value={selectedThinkingLevel}
                onLevelChange={changeThinkingLevel}
              />
              <RlmDepthPicker
                busy={disabled || depthBusy}
                compact
                depth={depth}
                onDepthChange={onDepthChange}
              />
            </div>
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

        {selectedSessionId === null ||
        (!task.submitting && !isGenerating) ? null : (
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
          </div>
        )}
      </form>

      <p
        className={
          selectedSessionId === null && task.status.length > 0
            ? 'mt-1 px-3 text-center text-xs text-muted-foreground'
            : 'sr-only'
        }
        role="status"
      >
        {task.status}
      </p>
    </>
  );
});
