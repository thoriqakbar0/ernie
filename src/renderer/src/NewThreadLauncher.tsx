import { type FormEvent, type RefObject, useEffect, useId, useRef, useState } from "react";
import { ModalDialog } from "./ModalDialog";

interface NewThreadLauncherProps {
  readonly open: boolean;
  readonly busy: boolean;
  readonly error: string;
  readonly onClose: () => void;
  readonly onCreate: (prompt: string | undefined) => Promise<void>;
  readonly returnFocusRef?: RefObject<HTMLElement | null> | undefined;
}

/** Command-palette-style launcher that creates a thread only after explicit confirmation. */
export function NewThreadLauncher({ open, busy, error, onClose, onCreate, returnFocusRef }: NewThreadLauncherProps) {
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const inputId = useId();

  useEffect(() => {
    if (open) setPrompt("");
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    await onCreate(trimmed.length > 0 ? trimmed : undefined);
  };

  return <ModalDialog
    open={open}
    onRequestClose={() => { if (!busy) onClose(); }}
    labelledBy={titleId}
    className="launcher-backdrop"
    initialFocusRef={inputRef}
    returnFocusRef={returnFocusRef}
  >
    <form className="thread-launcher" onSubmit={(event) => void submit(event)}>
      <div className="thread-launcher-heading">
        <span className="thread-launcher-mark" aria-hidden="true">+</span>
        <div><h2 id={titleId}>New thread</h2><p>Start a new conversation in current worktree</p></div>
        <kbd>esc</kbd>
      </div>
      <label htmlFor={inputId}>First message</label>
      <textarea
        id={inputId}
        ref={inputRef}
        placeholder="Describe what you want Prime Agent to do"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (prompt.trim().length > 0) event.currentTarget.form?.requestSubmit();
          }
        }}
        rows={3}
        disabled={busy}
      />
      {error && <div className="thread-launcher-error" role="alert">{error}</div>}
      <div className="thread-launcher-footer">
        <span>{prompt.trim().length > 0 && <><kbd>↵</kbd> create and send <span>·</span> </>}<kbd>⇧↵</kbd> new line</span>
        <button type="button" onClick={() => void onCreate(undefined)} disabled={busy}>Create blank thread</button>
        <button type="submit" className="primary" disabled={busy || prompt.trim().length === 0}>{busy ? "Creating…" : "Create thread and send message"}</button>
      </div>
    </form>
  </ModalDialog>;
}
