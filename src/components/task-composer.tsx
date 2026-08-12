import { ArrowUpIcon, PlusIcon } from 'lucide-react';
import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';

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
  createSingleVectorSkillSearch,
  createSkillSearch,
  parseSkillQuery,
} from '@/packages/skill-search';
import type { SkillSearchItem } from '@/packages/skill-search';

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
> & {
  readonly disabled?: boolean;
  readonly isGenerating?: boolean;
  readonly selectedSessionRlmMaxDepth?: number | null;
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
  selectedSessionRlmMaxDepth = null,
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
  const [singleVectorMatches, setSingleVectorMatches] = useState<
    readonly SkillSearchItem[]
  >(() => skills.slice(0, 6));
  const [singleVectorState, setSingleVectorState] = useState<
    'idle' | 'loading' | 'ready' | 'failed'
  >('idle');
  const skillQuery = parseSkillQuery(task.draft);
  const searchSkills = useMemo(() => createSkillSearch(skills), [skills]);
  const searchSkillsBySingleVector = useMemo(() => {
    let searchPromise: ReturnType<
      typeof createSingleVectorSkillSearch
    > | null = null;

    return async (query: string) => {
      searchPromise ??= createSingleVectorSkillSearch(skills);
      const searchSingleVector = await searchPromise;
      return searchSingleVector(query, 6);
    };
  }, [skills]);
  const skillQueryKind = skillQuery?.kind ?? null;
  const skillQueryTerm = skillQuery?.term ?? '';
  const fullTextMatches = useMemo(
    () =>
      skillQueryKind === 'full-text'
        ? searchSkills(skillQueryTerm, 6)
        : [],
    [searchSkills, skillQueryKind, skillQueryTerm],
  );
  const matchingSkills =
    skillQueryKind === 'single-vector'
      ? singleVectorMatches
      : fullTextMatches;
  const singleVectorVisible =
    skillQueryKind === 'single-vector' &&
    (singleVectorState === 'loading' ||
      singleVectorState === 'failed' ||
      matchingSkills.length > 0);
  const skillsOpen =
    !skillsDismissed &&
    (singleVectorVisible ||
      (skillQueryKind === 'full-text' && matchingSkills.length > 0));

  useEffect(() => {
    if (skillQueryKind !== 'single-vector') {
      setSingleVectorState('idle');
      return;
    }
    if (skillQueryTerm.length === 0) {
      setSingleVectorMatches(skills.slice(0, 6));
      setSingleVectorState('ready');
      return;
    }

    let current = true;
    setSingleVectorMatches([]);
    setSingleVectorState('loading');
    const searchDelay = window.setTimeout(() => {
      void searchSkillsBySingleVector(skillQueryTerm)
        .then((matches) => {
          if (!current) return;
          setActiveSkillIndex(0);
          setSingleVectorMatches(matches);
          setSingleVectorState('ready');
        })
        .catch(() => {
          if (!current) return;
          setSingleVectorMatches([]);
          setSingleVectorState('failed');
        });
    }, 150);

    return () => {
      current = false;
      window.clearTimeout(searchDelay);
    };
  }, [searchSkillsBySingleVector, skillQueryKind, skillQueryTerm, skills]);

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
      skillQueryKind === 'single-vector' &&
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault();
      return;
    }

    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function submitTask(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (skillQueryKind === 'single-vector') return;
    task.submit();
  }

  return (
    <>
      <form onSubmit={submitTask} aria-disabled={disabled}>
        <InputGroup
          className={`min-h-14 items-end rounded-2xl bg-card p-2 shadow-sm transition-opacity ${disabled ? 'opacity-45' : ''}`}
        >
          {skillsOpen ? (
            <div
              id={skillsListId}
              role="listbox"
              aria-label="Available skills"
              aria-busy={singleVectorState === 'loading'}
              className="absolute inset-x-0 bottom-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
            >
              <div className="flex items-center justify-between gap-3 px-3 py-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Skills
                </p>
                {skillQueryKind === 'single-vector' ? (
                  <span className="text-[10px] text-muted-foreground/70">
                    Natural language · //
                  </span>
                ) : null}
              </div>
              <div
                data-slot="skill-results"
                className="max-h-56 overflow-y-auto overscroll-contain"
              >
                {singleVectorState === 'loading' &&
                skillQueryKind === 'single-vector' ? (
                  <p
                    role="status"
                    className="px-3 py-5 text-center text-sm text-muted-foreground"
                  >
                    Preparing natural-language search…
                  </p>
                ) : null}
                {singleVectorState === 'failed' &&
                skillQueryKind === 'single-vector' ? (
                  <p
                    role="status"
                    className="px-3 py-5 text-center text-sm text-muted-foreground"
                  >
                    Natural-language search is unavailable.
                  </p>
                ) : null}
                {singleVectorState === 'loading' ||
                singleVectorState === 'failed'
                  ? null
                  : matchingSkills.map((skill, index) => (
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

          {selectedSessionId === null ? null : (
            <InputGroupAddon
              align="inline-start"
              className="h-9 self-end p-0"
            >
              <InputGroupButton
                size="icon-sm"
                className="size-8 rounded-full bg-muted text-foreground"
                aria-label="Add context"
                disabled={disabled}
              >
                <PlusIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}

          <InputGroupTextarea
            ref={textareaRef}
            id="task"
            autoFocus={selectedSessionId === null && selectedCwd !== null}
            rows={1}
            value={task.draft}
            className="max-h-28 min-h-9 select-text px-2 py-2 text-base [field-sizing:content]"
            placeholder={isGenerating ? 'Add a follow-up…' : 'Ask Prime Agent…'}
            aria-autocomplete="list"
            aria-controls={skillsOpen ? skillsListId : undefined}
            aria-expanded={skillsOpen}
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
              title={isGenerating ? 'Queue task (Enter)' : 'Send task (Enter)'}
              disabled={
                disabled ||
                !task.canSubmit ||
                task.submitting ||
                skillQueryKind === 'single-vector'
              }
            >
              <ArrowUpIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        {selectedSessionId === null ? null : (
          <div className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
            {isGenerating ? (
              <span className="px-2 font-medium text-foreground/70">
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
              <span className="px-2">depth {selectedSessionRlmMaxDepth}</span>
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
