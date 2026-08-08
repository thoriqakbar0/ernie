import { useId, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

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

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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
  const [depthValue, setDepthValue] = useState(() => String(rlmMaxDepth));
  const promptId = useId();
  const modelId = useId();
  const depthId = useId();
  const errorId = useId();
  const modelStatusId = useId();
  const modelProviderId = useId();

  const selectedModel = models.find((model) => model.id === selectedModelId);
  const hasSelectedModel = selectedModel !== undefined;
  const depthNumber = Number(depthValue);
  const depthIsValid = depthValue !== "" && Number.isSafeInteger(depthNumber) && depthNumber >= 0;
  const canSubmit = promptDraft.trim().length > 0
    && hasSelectedModel
    && !modelsLoading
    && modelsError === null
    && !busy
    && depthIsValid;
  const modelDescription = [
    selectedModel?.provider ? modelProviderId : undefined,
    modelsLoading || modelsError || models.length === 0 ? modelStatusId : undefined,
  ].filter((id): id is string => id !== undefined).join(" ") || undefined;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({ prompt: promptDraft.trim(), modelId: selectedModelId, rlmMaxDepth: depthNumber });
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    event.preventDefault();
    if (canSubmit) event.currentTarget.form?.requestSubmit();
  };

  return <section className="space-launchpad" aria-labelledby={`${promptId}-heading`}>
    <div className="space-launchpad-inner">
      <header className="space-launchpad-heading">
        <h1 id={`${promptId}-heading`}>{greeting}.</h1>
        <p>What do you want Prime Agent to do in <strong>{spaceLabel} · {worktreeLabel}</strong>?</p>
      </header>

      <form className="space-launchpad-form" onSubmit={submit} aria-busy={busy}>
        <div className="space-launchpad-composer">
          <label className="sr-only" htmlFor={promptId}>First message</label>
          <textarea
            id={promptId}
            value={promptDraft}
            placeholder="Describe what you want to build, fix, or explore…"
            rows={6}
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

              <label className="space-launchpad-depth-control" htmlFor={depthId} title="RLM max depth">
                <span>Depth</span>
                <input
                  id={depthId}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={depthValue}
                  disabled={busy}
                  aria-label="RLM max depth"
                  aria-invalid={!depthIsValid}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDepthValue(value);
                    const next = Number(value);
                    if (value !== "" && Number.isSafeInteger(next) && next >= 0) onRlmMaxDepthChange(next);
                  }}
                />
              </label>
            </div>
            <button className="space-launchpad-submit" type="submit" disabled={!canSubmit}>Start thread</button>
          </footer>
        </div>

        {!depthIsValid && <span className="space-launchpad-field-error">Depth must be a whole number of 0 or more.</span>}
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
