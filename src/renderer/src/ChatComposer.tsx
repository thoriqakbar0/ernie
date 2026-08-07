import type { FormEvent, KeyboardEvent, RefObject } from "react";
import type { AgentState } from "../../shared/contract";

function SendIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 12-6-4 12-2.5-4.5L4 10Z" /><path d="m9.5 11.5 3-3" /></svg>;
}

/** Draft composer adapted from T3 Code's compact composer interaction and hierarchy. */
export function ChatComposer({ projectName, draft, state, busy, error, inputRef, onDraftChange, onSend }: {
  readonly projectName: string;
  readonly draft: string;
  readonly state: AgentState | null;
  readonly busy: boolean;
  readonly error: string;
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  readonly onDraftChange: (value: string) => void;
  readonly onSend: () => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onSend(); };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSend();
  };
  return <section className="draft-surface" aria-labelledby="draft-heading">
    <div className="draft-copy"><h1 id="draft-heading">What should we build in <span>{projectName}</span>?</h1><p>Describe the outcome. Prime Agent will inspect the project and handle the implementation.</p></div>
    <form className="prompt-composer" onSubmit={submit}>
      <textarea ref={inputRef} aria-label="Message Prime Agent" value={draft} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={keyDown} placeholder="Ask anything, @tag files, $use skills, or / for commands" disabled={state?.connection !== "ready"} />
      <div className="composer-footer"><span>{error || (state?.isStreaming ? "Prime Agent is working…" : "Enter to send · Shift+Enter for a new line")}</span><button type="submit" aria-label="Send message" disabled={!draft.trim() || busy || state?.connection !== "ready"}><SendIcon /></button></div>
    </form>
  </section>;
}
