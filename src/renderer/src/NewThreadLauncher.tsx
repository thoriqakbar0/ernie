import { FormEvent, useEffect, useRef, useState } from "react";

interface NewThreadLauncherProps {
  readonly open: boolean;
  readonly busy: boolean;
  readonly error: string;
  readonly onClose: () => void;
  readonly onCreate: (prompt: string | undefined) => Promise<void>;
}

/** Command-palette-style launcher that creates a thread only after explicit confirmation. */
export function NewThreadLauncher({ open, busy, error, onClose, onCreate }: NewThreadLauncherProps) {
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setPrompt("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const keyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    await onCreate(trimmed.length > 0 ? trimmed : undefined);
  };

  return <div className="launcher-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <form className="thread-launcher" role="dialog" aria-modal="true" aria-labelledby="new-thread-title" onSubmit={(event) => void submit(event)}>
      <div className="thread-launcher-heading">
        <span className="thread-launcher-mark" aria-hidden="true">+</span>
        <div><h2 id="new-thread-title">New agent thread</h2><p>Start fresh in this project.</p></div>
        <kbd>esc</kbd>
      </div>
      <textarea
        ref={inputRef}
        aria-label="First instruction"
        placeholder="What should Prime Agent work on?"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        rows={3}
        disabled={busy}
      />
      {error && <div className="thread-launcher-error" role="alert">{error}</div>}
      <div className="thread-launcher-footer">
        <span><kbd>↵</kbd> create <span>·</span> <kbd>⇧↵</kbd> new line</span>
        <button type="button" onClick={() => void onCreate(undefined)} disabled={busy}>Start blank</button>
        <button type="submit" className="primary" disabled={busy}>{busy ? "Starting…" : "Create thread"}</button>
      </div>
    </form>
  </div>;
}
