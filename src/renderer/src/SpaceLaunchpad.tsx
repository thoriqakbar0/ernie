import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { AgentThinkingLevel } from "../../shared/spaceRuntime";

function thinkingLevelFromValue(value: string): AgentThinkingLevel | undefined {
  switch (value) {
    case "off": case "minimal": case "low": case "medium": case "high": case "xhigh": case "max": return value;
    default: return undefined;
  }
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
  readonly rlmMaxDepth: number;
  readonly onRlmMaxDepthChange: (depth: number) => void;
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
  rlmMaxDepth,
  onRlmMaxDepthChange,
  onRetryModels,
  promptDraft,
  onPromptDraftChange,
  busy,
  error,
  onSubmit,
}: SpaceLaunchpadProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customDepthSelected, setCustomDepthSelected] = useState(rlmMaxDepth > 2);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const advancedRef = useRef<HTMLDivElement>(null);
  const promptId = useId();
  const projectMenuId = useId();
  const modelId = useId();
  const thinkingId = useId();
  const advancedId = useId();
  const errorId = useId();
  const modelStatusId = useId();
  const modelProviderId = useId();

  useEffect(() => {
    if (busy) {
      setProjectMenuOpen(false);
      setAdvancedOpen(false);
    }
  }, [busy]);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !projectMenuRef.current?.contains(event.target)) setProjectMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    return () => document.removeEventListener("pointerdown", closeOnPointerDown);
  }, [projectMenuOpen]);

  useEffect(() => {
    if (!advancedOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !advancedRef.current?.contains(event.target)) setAdvancedOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAdvancedOpen(false);
      requestAnimationFrame(() => advancedRef.current?.querySelector<HTMLButtonElement>(".space-launchpad-advanced-trigger")?.focus());
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [advancedOpen]);

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
    onSubmit({ prompt: promptDraft.trim(), modelId: selectedModelId, thinkingLevel: selectedThinkingLevel, rlmMaxDepth });
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
                <label className="sr-only" htmlFor={modelId}>Model</label>
                <select
                  id={modelId}
                  className="space-launchpad-model-select"
                  value={hasSelectedModel ? selectedModelId : ""}
                  disabled={busy || modelsLoading || modelsError !== null || models.length === 0}
                  aria-describedby={modelDescription}
                  title="Model"
                  onChange={(event) => { onModelChange(event.currentTarget.value); }}
                >
                  {!hasSelectedModel && <option value="" disabled>{modelsLoading ? "Loading…" : models.length === 0 ? "No models" : "Choose model"}</option>}
                  {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                </select>
                {selectedModel?.provider && <p id={modelProviderId} className="sr-only">Selected provider: {selectedModel.provider}</p>}
                <label className="sr-only" htmlFor={thinkingId}>Thinking level</label>
                <select
                  id={thinkingId}
                  className="space-launchpad-thinking-select"
                  value={hasSelectedThinkingLevel ? selectedThinkingLevel : ""}
                  disabled={busy || !hasSelectedModel || thinkingLevels.length === 0}
                  title="Thinking level"
                  onChange={(event) => {
                    const level = thinkingLevelFromValue(event.currentTarget.value);
                    if (level !== undefined) onThinkingLevelChange(level);
                  }}
                >
                  {!hasSelectedThinkingLevel && <option value="" disabled>Thinking</option>}
                  {thinkingLevels.map((level) => <option key={level} value={level}>{level === "off" ? "Thinking off" : `${level[0]?.toUpperCase()}${level.slice(1)}`}</option>)}
                </select>
                <div ref={advancedRef} className="space-launchpad-advanced">
                  <button
                    type="button"
                    className="space-launchpad-advanced-trigger"
                    aria-expanded={advancedOpen}
                    aria-controls={advancedId}
                    disabled={busy}
                    onClick={() => setAdvancedOpen((current) => !current)}
                  >Advanced</button>
                  {advancedOpen && <div id={advancedId} className="space-launchpad-advanced-popover" role="dialog" aria-label="Advanced launch settings">
                    <label htmlFor={`${advancedId}-depth`}>RLM depth</label>
                    <select
                      id={`${advancedId}-depth`}
                      value={customDepthSelected ? "custom" : String(rlmMaxDepth)}
                      disabled={busy}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        if (value === "custom") setCustomDepthSelected(true);
                        else {
                          setCustomDepthSelected(false);
                          onRlmMaxDepthChange(Number(value));
                        }
                      }}
                    >
                      <option value="0">Root only</option>
                      <option value="1">Subagents</option>
                      <option value="2">Nested</option>
                      <option value="custom">Custom</option>
                    </select>
                    {customDepthSelected && <label className="space-launchpad-custom-depth">
                      <span>Custom maximum depth</span>
                      <input type="number" min="0" step="1" value={rlmMaxDepth} disabled={busy} onChange={(event) => {
                        const depth = event.currentTarget.valueAsNumber;
                        if (Number.isSafeInteger(depth) && depth >= 0) onRlmMaxDepthChange(depth);
                      }} />
                    </label>}
                    <p>Depth is fixed when this worktree runtime starts.</p>
                  </div>}
                </div>
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
