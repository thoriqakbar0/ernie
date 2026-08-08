import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";

export interface SpaceLaunchpadModelOption {
  readonly id: string;
  readonly label: string;
  readonly provider?: string;
}

export interface SpaceLaunchpadSubmitPayload {
  readonly prompt: string;
  readonly modelId: string;
  readonly rlmMaxDepth: number;
}

export interface SpaceLaunchpadProps {
  readonly spaceLabel: string;
  readonly worktreeLabel: string;
  readonly models: readonly SpaceLaunchpadModelOption[];
  readonly selectedModelId: string;
  readonly modelsLoading: boolean;
  readonly modelsError: string | null;
  readonly onModelChange: (modelId: string) => void;
  readonly rlmMaxDepth: number;
  readonly onRlmMaxDepthChange: (depth: number) => void;
  readonly onRetryModels: () => void;
  readonly promptDraft: string;
  readonly onPromptDraftChange: (prompt: string) => void;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSubmit: (payload: SpaceLaunchpadSubmitPayload) => void;
}

type PresetDepth = 0 | 1 | 2 | 3;
type DepthChoice = `${PresetDepth}` | "custom";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function depthChoiceFor(value: number): DepthChoice {
  switch (value) {
    case 0: return "0";
    case 1: return "1";
    case 2: return "2";
    case 3: return "3";
    default: return "custom";
  }
}

/** Quiet first-thread composer for an empty Space. */
export function SpaceLaunchpad({
  spaceLabel,
  worktreeLabel,
  models,
  selectedModelId,
  modelsLoading,
  modelsError,
  onModelChange,
  rlmMaxDepth,
  onRlmMaxDepthChange,
  onRetryModels,
  promptDraft,
  onPromptDraftChange,
  busy,
  error,
  onSubmit,
}: SpaceLaunchpadProps) {
  const [greeting] = useState(() => greetingForHour(new Date().getHours()));
  const [depthChoice, setDepthChoice] = useState<DepthChoice>(() => depthChoiceFor(rlmMaxDepth));
  const [customDepth, setCustomDepth] = useState(() => String(rlmMaxDepth > 3 ? rlmMaxDepth : 4));
  const customDepthRef = useRef<HTMLInputElement>(null);
  const promptId = useId();
  const modelId = useId();
  const depthId = useId();
  const customDepthId = useId();
  const hintId = useId();
  const errorId = useId();
  const modelStatusId = useId();

  useEffect(() => {
    if (depthChoice !== "custom") return;
    const frame = requestAnimationFrame(() => customDepthRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [depthChoice]);

  const customDepthNumber = Number(customDepth);
  const customDepthIsValid = customDepth !== ""
    && Number.isSafeInteger(customDepthNumber)
    && customDepthNumber >= 0;
  const submittedDepth = depthChoice === "custom" ? customDepthNumber : Number(depthChoice);
  const hasSelectedModel = models.some((model) => model.id === selectedModelId);
  const canSubmit = promptDraft.trim().length > 0
    && hasSelectedModel
    && !modelsLoading
    && modelsError === null
    && !busy
    && (depthChoice !== "custom" || customDepthIsValid);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({ prompt: promptDraft.trim(), modelId: selectedModelId, rlmMaxDepth: submittedDepth });
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    event.preventDefault();
    if (canSubmit) event.currentTarget.form?.requestSubmit();
  };

  const handleDepthChoice = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value;
    if (value === "custom") {
      setDepthChoice(value);
      const next = Number(customDepth);
      if (Number.isSafeInteger(next) && next >= 0) onRlmMaxDepthChange(next);
    } else if (value === "0" || value === "1" || value === "2" || value === "3") {
      setDepthChoice(value);
      onRlmMaxDepthChange(Number(value));
    }
  };

  return <section className="space-launchpad" aria-labelledby={`${promptId}-heading`}>
    <div className="space-launchpad-inner">
      <header className="space-launchpad-heading">
        <h1 id={`${promptId}-heading`}>{greeting}.</h1>
        <p>What do you want Prime Agent to do in <strong>{spaceLabel} · {worktreeLabel}</strong>?</p>
      </header>

      <form className="space-launchpad-form" onSubmit={submit} aria-busy={busy}>
        <div className="space-launchpad-prompt-field">
          <label className="sr-only" htmlFor={promptId}>First message</label>
          <textarea
            id={promptId}
            value={promptDraft}
            placeholder="Describe the task, outcome, or question"
            rows={6}
            required
            disabled={busy}
            aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
            onChange={(event) => { onPromptDraftChange(event.currentTarget.value); }}
            onKeyDown={handlePromptKeyDown}
          />
        </div>

        {error && <div className="space-launchpad-error" id={errorId} role="alert">
          <strong>Couldn’t start the thread. Your message is still here.</strong>
          <p>{error}</p>
        </div>}

        <div className="space-launchpad-controls">
          <div className="space-launchpad-field">
            <label htmlFor={modelId}>Model</label>
            <select
              id={modelId}
              value={hasSelectedModel ? selectedModelId : ""}
              disabled={busy || modelsLoading || modelsError !== null || models.length === 0}
              aria-describedby={(modelsLoading || modelsError || models.length === 0) ? modelStatusId : undefined}
              onChange={(event) => { onModelChange(event.currentTarget.value); }}
            >
              {!hasSelectedModel && <option value="" disabled>{modelsLoading ? "Loading models…" : models.length === 0 ? "No models available" : "Choose a model"}</option>}
              {models.map((model) => <option key={model.id} value={model.id}>{model.provider ? `${model.provider} · ${model.label}` : model.label}</option>)}
            </select>
            {(modelsLoading || modelsError || models.length === 0) && <div className="space-launchpad-model-status" id={modelStatusId} aria-live="polite">
              {modelsLoading ? <span>Loading models…</span> : modelsError ? <>
                <span>{modelsError}</span>
                <button type="button" disabled={busy} onClick={onRetryModels}>Retry</button>
              </> : <span>No models are available.</span>}
            </div>}
          </div>

          <div className="space-launchpad-field space-launchpad-depth-field">
            <label htmlFor={depthId}>RLM max depth</label>
            <select id={depthId} value={depthChoice} disabled={busy} onChange={handleDepthChoice}>
              <option value="0">0 · Root only</option>
              <option value="1">1 · One subagent level</option>
              <option value="2">2 · Two subagent levels</option>
              <option value="3">3 · Three subagent levels</option>
              <option value="custom">Custom…</option>
            </select>
            {depthChoice === "custom" && <>
              <label className="sr-only" htmlFor={customDepthId}>Custom RLM max depth</label>
              <input
                ref={customDepthRef}
                id={customDepthId}
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={customDepth}
                disabled={busy}
                aria-invalid={!customDepthIsValid}
                aria-describedby={!customDepthIsValid ? `${customDepthId}-error` : undefined}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setCustomDepth(value);
                  const next = Number(value);
                  if (value !== "" && Number.isSafeInteger(next) && next >= 0) onRlmMaxDepthChange(next);
                }}
              />
              {!customDepthIsValid && <span id={`${customDepthId}-error`} className="space-launchpad-field-error">Enter a whole number of 0 or more.</span>}
            </>}
          </div>
        </div>

        <footer className="space-launchpad-actions">
          <p id={hintId}>Enter to start · Shift–Enter for a new line</p>
          <button className="space-launchpad-submit" type="submit" disabled={!canSubmit}>Start thread</button>
        </footer>
      </form>
    </div>
  </section>;
}
