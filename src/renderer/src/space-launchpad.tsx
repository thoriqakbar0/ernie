import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { AgentThinkingLevel } from "../../shared/spaceRuntime";

function thinkingLevelFromValue(value: string): AgentThinkingLevel | undefined {
  switch (value) {
    case "off": case "minimal": case "low": case "medium": case "high": case "xhigh": case "max": return value;
    default: return undefined;
  }
}

function thinkingEffortLabel(level: AgentThinkingLevel): string {
  switch (level) {
    case "off": return "Off";
    case "minimal": return "Minimal effort";
    case "low": return "Low effort";
    case "medium": return "Medium effort";
    case "high": return "High effort";
    case "xhigh": return "Extra high";
    case "max": return "Maximum effort";
  }
}

interface LaunchpadDropdownOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

function LaunchpadDropdown({ id, label, className, options, selectedValue, placeholder, disabled, describedBy, onChange }: {
  readonly id: string;
  readonly label: string;
  readonly className: string;
  readonly options: readonly LaunchpadDropdownOption[];
  readonly selectedValue: string;
  readonly placeholder: string;
  readonly disabled: boolean;
  readonly describedBy?: string;
  readonly onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef(new Map<number, HTMLButtonElement>());
  const listboxId = `${id}-listbox`;
  const selectedIndex = options.findIndex((option) => option.value === selectedValue);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const [activeOptionIndex, setActiveOptionIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);

  const show = (index = selectedIndex >= 0 ? selectedIndex : 0) => {
    if (disabled || options.length === 0) return;
    setActiveOptionIndex(index);
    setOpen(true);
  };
  const hide = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const choose = (value: string) => {
    onChange(value);
    hide();
  };

  useLayoutEffect(() => {
    if (open) optionRefs.current.get(activeOptionIndex)?.focus();
  }, [activeOptionIndex, open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) hide(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    return () => document.removeEventListener("pointerdown", closeOnPointerDown);
  }, [open]);

  const handleListboxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextIndex: number | undefined;
    if (event.key === "ArrowDown") nextIndex = (activeOptionIndex + 1 + options.length) % options.length;
    if (event.key === "ArrowUp") nextIndex = (activeOptionIndex - 1 + options.length) % options.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = options.length - 1;
    if (event.key === "Escape") {
      event.preventDefault();
      hide();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      const option = options[activeOptionIndex];
      if (!option) return;
      event.preventDefault();
      choose(option.value);
      return;
    }
    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const query = event.key.toLocaleLowerCase();
      const searchOrder = options.map((_, index) => (activeOptionIndex + index + 1) % options.length);
      nextIndex = searchOrder.find((index) => options[index]?.label.toLocaleLowerCase().startsWith(query));
    }
    if (nextIndex === undefined) return;
    event.preventDefault();
    setActiveOptionIndex(nextIndex);
  };

  return <div
    ref={rootRef}
    className={`space-launchpad-dropdown ${className}`}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
  >
    <button
      ref={triggerRef}
      id={id}
      type="button"
      className="space-launchpad-dropdown-trigger"
      aria-label={`${label}: ${selected?.label ?? placeholder}`}
      aria-haspopup="listbox"
      aria-controls={listboxId}
      aria-expanded={open}
      aria-describedby={describedBy}
      disabled={disabled}
      title={label}
      onClick={() => { if (open) hide(); else show(); }}
      onKeyDown={(event) => {
        const navigationKey = event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End";
        const typeahead = event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey
          ? options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()))
          : -1;
        if (!navigationKey && typeahead < 0) return;
        event.preventDefault();
        const index = typeahead >= 0 ? typeahead
          : event.key === "ArrowUp" || event.key === "End" ? options.length - 1
          : event.key === "Home" ? 0
          : selectedIndex >= 0 ? selectedIndex : 0;
        show(index);
      }}
    >
      <span>{selected?.label ?? placeholder}</span>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8" /></svg>
    </button>
    {open && <div id={listboxId} className="space-launchpad-dropdown-list" role="listbox" aria-label={label} onKeyDown={handleListboxKeyDown}>
      {options.map((option, index) => <button
        key={option.value}
        ref={(element) => { if (element) optionRefs.current.set(index, element); else optionRefs.current.delete(index); }}
        type="button"
        role="option"
        aria-selected={option.value === selectedValue}
        tabIndex={index === activeOptionIndex ? 0 : -1}
        onClick={() => choose(option.value)}
      ><span className="space-launchpad-dropdown-option-copy"><span>{option.label}</span>{option.description && <small>{option.description}</small>}</span>{option.value === selectedValue && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7" /></svg>}</button>)}
    </div>}
  </div>;
}

export interface SpaceLaunchpadModelOption {
  readonly id: string;
  readonly label: string;
  readonly provider?: string;
  readonly thinkingLevels: readonly AgentThinkingLevel[];
}

export interface SpaceLaunchpadProjectOption {
  readonly id: string;
  readonly label: string;
  readonly path: string;
}

export interface SpaceLaunchpadSubmitPayload {
  readonly prompt: string;
  readonly modelId: string;
  readonly thinkingLevel: AgentThinkingLevel;
  readonly rlmMaxDepth: number;
}

export interface SpaceLaunchpadProps {
  readonly spaceId: string;
  readonly spaceLabel: string;
  readonly worktreeLabel: string;
  readonly projects: readonly SpaceLaunchpadProjectOption[];
  readonly onSelectProject: (projectId: string) => void;
  readonly onOpenDirectory: () => void;
  readonly openingDirectory: boolean;
  readonly openDirectoryError: string | undefined;
  readonly models: readonly SpaceLaunchpadModelOption[];
  readonly selectedModelId: string;
  readonly modelsLoading: boolean;
  readonly modelsError: string | null;
  readonly onModelChange: (modelId: string) => void;
  readonly selectedThinkingLevel: AgentThinkingLevel;
  readonly onThinkingLevelChange: (level: AgentThinkingLevel) => void;
  readonly onRetryModels: () => void;
  readonly promptDraft: string;
  readonly onPromptDraftChange: (prompt: string) => void;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSubmit: (payload: SpaceLaunchpadSubmitPayload) => void;
}

/** T3-inspired first-thread draft composer backed by Ernie's Space runtime contract. */
export function SpaceLaunchpad({
  spaceId,
  spaceLabel,
  worktreeLabel,
  projects,
  onSelectProject,
  onOpenDirectory,
  openingDirectory,
  openDirectoryError,
  models,
  selectedModelId,
  modelsLoading,
  modelsError,
  onModelChange,
  selectedThinkingLevel,
  onThinkingLevelChange,
  onRetryModels,
  promptDraft,
  onPromptDraftChange,
  busy,
  error,
  onSubmit,
}: SpaceLaunchpadProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const promptId = useId();
  const projectMenuId = useId();
  const modelId = useId();
  const thinkingId = useId();
  const errorId = useId();
  const modelStatusId = useId();
  const modelProviderId = useId();

  useEffect(() => {
    if (busy) setProjectMenuOpen(false);
  }, [busy]);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !projectMenuRef.current?.contains(event.target)) setProjectMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    return () => document.removeEventListener("pointerdown", closeOnPointerDown);
  }, [projectMenuOpen]);


  const selectedModel = models.find((model) => model.id === selectedModelId);
  const hasSelectedModel = selectedModel !== undefined;
  const thinkingLevels = selectedModel?.thinkingLevels ?? [];
  const hasSelectedThinkingLevel = thinkingLevels.includes(selectedThinkingLevel);
  const canSubmit = promptDraft.trim().length > 0
    && hasSelectedModel
    && hasSelectedThinkingLevel
    && !modelsLoading
    && modelsError === null
    && !busy;
  const modelDescription = [
    selectedModel?.provider ? modelProviderId : undefined,
    modelsLoading || modelsError || models.length === 0 ? modelStatusId : undefined,
  ].filter((id): id is string => id !== undefined).join(" ") || undefined;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({ prompt: promptDraft.trim(), modelId: selectedModelId, thinkingLevel: selectedThinkingLevel, rlmMaxDepth: 0 });
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    event.preventDefault();
    if (canSubmit) event.currentTarget.form?.requestSubmit();
  };

  const focusProjectMenuItem = (position: "checked" | "first" | "last") => {
    requestAnimationFrame(() => {
      const items = [...(projectMenuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio'], [role='menuitem']") ?? [])];
      const target = position === "last" ? items.at(-1)
        : position === "checked" ? items.find((item) => item.getAttribute("aria-checked") === "true") ?? items[0]
        : items[0];
      target?.focus();
    });
  };
  const openProjectMenu = (position: "checked" | "first" | "last" = "checked") => {
    setProjectMenuOpen(true);
    focusProjectMenuItem(position);
  };
  const closeProjectMenu = (restoreFocus = true) => {
    setProjectMenuOpen(false);
    if (restoreFocus) requestAnimationFrame(() => projectMenuRef.current?.querySelector<HTMLButtonElement>(".space-launchpad-project-trigger")?.focus());
  };
  const handleProjectMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitemradio'], [role='menuitem']")];
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | undefined;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (event.key === "Escape") {
      event.preventDefault();
      closeProjectMenu();
      return;
    }
    if (nextIndex === undefined) return;
    event.preventDefault();
    items[nextIndex]?.focus();
  };

  return <section className="space-launchpad" aria-labelledby={`${promptId}-heading`}>
    <div className="space-launchpad-inner">
      <header className="space-launchpad-heading">
        <div ref={projectMenuRef} className="space-launchpad-heading-line">
          <h1 id={`${promptId}-heading`}>What should we build in{" "}
            <span className="space-launchpad-project-picker">
              <button
                type="button"
                className="space-launchpad-project-trigger"
                aria-haspopup="menu"
                aria-controls={projectMenuId}
                aria-expanded={projectMenuOpen}
                disabled={busy}
                onClick={() => { if (projectMenuOpen) closeProjectMenu(); else openProjectMenu(); }}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && projectMenuOpen) {
                    event.preventDefault();
                    closeProjectMenu();
                  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    openProjectMenu(event.key === "ArrowUp" ? "last" : "first");
                  }
                }}
              ><span className="space-launchpad-project-label">{spaceLabel}</span><span aria-hidden="true">⌄</span></button>
            </span>?
          </h1>
          {projectMenuOpen && <div id={projectMenuId} className="space-launchpad-project-menu" role="menu" aria-label="Choose a Space" onKeyDown={handleProjectMenuKeyDown}>
            {projects.map((project) => <button
              key={project.id}
              type="button"
              role="menuitemradio"
              aria-checked={project.id === spaceId}
              title={project.path}
              onClick={() => {
                if (project.id === spaceId) closeProjectMenu();
                else {
                  setProjectMenuOpen(false);
                  onSelectProject(project.id);
                  requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".space-launchpad-project-trigger")?.focus());
                }
              }}
            ><span className="space-launchpad-project-option-copy"><strong>{project.label}</strong><small>{project.path}</small></span>{project.id === spaceId && <span aria-hidden="true">✓</span>}</button>)}
            <span className="space-launchpad-project-separator" role="separator" />
            <button type="button" role="menuitem" disabled={openingDirectory || busy} onClick={() => { closeProjectMenu(); onOpenDirectory(); }}>
              <span aria-hidden="true">＋</span><span>{openingDirectory ? "Opening folder…" : "New project"}</span>
            </button>
          </div>}
        </div>
        <p><span>{spaceLabel}</span><span aria-hidden="true"> · </span><span>{worktreeLabel}</span></p>
        {openDirectoryError && <p className="space-launchpad-project-error" role="alert">{openDirectoryError}</p>}
      </header>

      <form className="space-launchpad-form" onSubmit={submit} aria-busy={busy}>
        <div className="space-launchpad-frame">
          <div className="space-launchpad-composer">
            <label className="sr-only" htmlFor={promptId}>First message</label>
            <textarea
              id={promptId}
              value={promptDraft}
              placeholder="Ask anything"
              rows={5}
              required
              disabled={busy}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => { onPromptDraftChange(event.currentTarget.value); }}
              onKeyDown={handlePromptKeyDown}
            />
            <footer className="space-launchpad-toolbar">
              <div className="space-launchpad-toolbar-controls">
                <LaunchpadDropdown
                  id={modelId}
                  label="Model"
                  className="model"
                  options={models.map((model) => ({ value: model.id, label: model.label, ...(model.provider ? { description: model.provider } : {}) }))}
                  selectedValue={hasSelectedModel ? selectedModelId : ""}
                  placeholder={modelsLoading ? "Loading…" : models.length === 0 ? "No models" : "Choose model"}
                  disabled={busy || modelsLoading || modelsError !== null || models.length === 0}
                  {...(modelDescription ? { describedBy: modelDescription } : {})}
                  onChange={onModelChange}
                />
                {selectedModel?.provider && <p id={modelProviderId} className="sr-only">Selected provider: {selectedModel.provider}</p>}
                <LaunchpadDropdown
                  id={thinkingId}
                  label="Thinking effort"
                  className="thinking"
                  options={thinkingLevels.map((level) => ({ value: level, label: thinkingEffortLabel(level) }))}
                  selectedValue={hasSelectedThinkingLevel ? selectedThinkingLevel : ""}
                  placeholder="Thinking effort"
                  disabled={busy || !hasSelectedModel || thinkingLevels.length === 0}
                  onChange={(value) => {
                    const level = thinkingLevelFromValue(value);
                    if (level !== undefined) onThinkingLevelChange(level);
                  }}
                />
              </div>
              <button className="space-launchpad-submit" type="submit" disabled={!canSubmit} aria-label={busy ? "Starting thread" : "Send message"} title={busy ? "Starting thread" : "Send message"}>
                {busy ? <span className="space-launchpad-spinner" aria-hidden="true" /> : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 13V3M8 3 4 7M8 3l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </button>
            </footer>
          </div>
        </div>

        {(modelsLoading || modelsError || models.length === 0) && <div className="space-launchpad-model-status" id={modelStatusId} aria-live="polite">
          {modelsLoading ? <span>Loading models…</span> : modelsError ? <>
            <span>{modelsError}</span>
            <button type="button" disabled={busy} onClick={onRetryModels}>Retry</button>
          </> : <span>No models are available.</span>}
        </div>}
        {error && <div className="space-launchpad-error" id={errorId} role="alert">
          <strong>Couldn’t start the thread. Your message is still here.</strong>
          <p>{error}</p>
        </div>}
      </form>
    </div>
  </section>;
}
