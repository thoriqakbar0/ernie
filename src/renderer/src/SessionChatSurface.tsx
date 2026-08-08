import { useEffect, useMemo, useReducer, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { AgentSlashCommand } from "../../shared/commands";
import type { AgentState } from "../../shared/contract";
import type { SessionTranscriptEvent } from "../../shared/sessionTranscript";
import type { WorkspaceAgent } from "../../shared/workspace";
import type { ThreadItem } from "./transcript";
import { ComposerAutocomplete, matchingCommands } from "./ComposerAutocomplete";
import { sessionTranscriptReducer } from "./sessionTranscript";
import { SessionTranscriptView } from "./SessionTranscriptView";
import { TranscriptItem } from "./TranscriptItem";

function SendIcon({ stop = false }: { readonly stop?: boolean }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true">{stop
    ? <rect x="6" y="6" width="8" height="8" rx="1" fill="currentColor" stroke="none" />
    : <><path d="m3.5 10 13-6-4.6 12-2.1-4.2z" /><path d="m9.8 11.8 6.7-7.8" /></>}</svg>;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function ChatComposer({ state, onAppendUser }: { readonly state: AgentState; readonly onAppendUser?: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [commands, setCommands] = useState<readonly AgentSlashCommand[]>([]);
  const [commandIndex, setCommandIndex] = useState(0);
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const matches = useMemo(() => commandMenuDismissed ? [] : matchingCommands(commands, draft), [commands, commandMenuDismissed, draft]);
  const disabled = state.connection !== "ready" || state.isCompacting || state.switchingExecutionTo !== undefined;

  useEffect(() => {
    if (state.connection !== "ready") return;
    let active = true;
    void window.ernie.getCommands().then((available) => { if (active) setCommands(available); }).catch(() => { if (active) setCommands([]); });
    return () => { active = false; };
  }, [state.connection]);

  useEffect(() => { setCommandIndex(0); setCommandMenuDismissed(false); }, [draft]);

  const send = async () => {
    const message = draft.trim();
    if (!message || disabled) return;
    setError("");
    const result = await window.ernie.command({ type: "prompt", message, behavior: state.isStreaming ? "steer" : "now" });
    if (result.ok) {
      onAppendUser?.(message);
      setDraft("");
    }
    else setError(result.error ?? "Unable to send this message. Try again.");
  };
  const chooseCommand = (command: AgentSlashCommand) => {
    setDraft(`/${command.name} `);
    setCommandMenuDismissed(true);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (matches.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setCommandIndex((index) => (index + direction + matches.length) % matches.length);
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing)) {
        event.preventDefault();
        const command = matches[Math.min(commandIndex, matches.length - 1)];
        if (command) chooseCommand(command);
        return;
      }
      if (event.key === "Escape") { event.preventDefault(); setCommandMenuDismissed(true); return; }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void send(); };
  const placeholder = disabled ? state.detail : state.isStreaming ? "Steer the current run…" : "Message Prime Agent…";

  return <div className="chat-composer-wrap">
    <ComposerAutocomplete commands={matches} activeIndex={commandIndex} onActiveIndexChange={setCommandIndex} onChoose={chooseCommand} />
    <form className="chat-composer" onSubmit={submit}>
      <textarea
        aria-label="Message Prime Agent"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={matches.length > 0}
        aria-controls={matches.length > 0 ? "prime-command-menu" : undefined}
        aria-activedescendant={matches.length > 0 ? `command-option-${commandIndex}` : undefined}
        rows={2}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={keyDown}
      />
      <footer>
        <span className="chat-usage">{state.contextPercent}% context · {formatTokens(state.totalTokens)} tokens · {state.cost}</span>
        {state.isStreaming
          ? <button type="button" className="chat-send stop" aria-label="Stop response" onClick={() => { void window.ernie.command({ type: "abort" }); }}><SendIcon stop /></button>
          : <button type="submit" className="chat-send" aria-label="Send message" disabled={disabled || draft.trim().length === 0}><SendIcon /></button>}
      </footer>
    </form>
    {error && <p className="chat-composer-error" role="alert">{error}</p>}
  </div>;
}

export function LiveSessionChatSurface({ agent, state, items, onAppendUser, projectLabel, worktreeLabel }: {
  readonly agent: WorkspaceAgent;
  readonly state: AgentState;
  readonly items: readonly ThreadItem[];
  readonly onAppendUser: (text: string) => void;
  readonly projectLabel: string;
  readonly worktreeLabel: string;
}) {
  return <SessionTranscriptView
    agent={agent}
    items={items}
    state="ready"
    interactive
    headerContext={`${projectLabel} · ${worktreeLabel} · Interactive`}
    onRetry={() => {}}
    renderItem={(item) => <TranscriptItem item={item} assistantLabel="Prime Agent" />}
    footer={<ChatComposer state={state} onAppendUser={onAppendUser} />}
  />;
}

export function SessionChatSurface({ agent, state, interactive, projectLabel, worktreeLabel }: {
  readonly agent: WorkspaceAgent;
  readonly state: AgentState;
  readonly interactive: boolean;
  readonly projectLabel: string;
  readonly worktreeLabel: string;
}) {
  const [items, dispatch] = useReducer(sessionTranscriptReducer, []);
  const [streamState, setStreamState] = useState<"loading" | "ready" | "error">("loading");
  const [retrySequence, setRetrySequence] = useState(0);
  const activeSessionId = agent.activeSessionId ?? agent.id;

  useEffect(() => {
    let active = true;
    dispatch({ kind: "snapshot", activeSessionId, items: [], historyTruncated: false });
    setStreamState("loading");
    const unsubscribe = window.ernie.onSessionTranscriptEvent((event: SessionTranscriptEvent) => {
      if (active && event.activeSessionId === activeSessionId) {
        dispatch(event);
        setStreamState(event.kind === "closed" ? "error" : "ready");
      }
    });
    void window.ernie.selectSessionTranscript(activeSessionId)
      .then((snapshot) => { if (active) { dispatch(snapshot); setStreamState("ready"); } })
      .catch(() => { if (active) setStreamState("error"); });
    return () => {
      active = false;
      unsubscribe();
      void window.ernie.detachSessionTranscript();
    };
  }, [activeSessionId, retrySequence]);

  return <SessionTranscriptView
    agent={agent}
    items={items}
    state={streamState}
    interactive={interactive}
    headerContext={`${projectLabel} · ${worktreeLabel} · ${interactive ? "Interactive" : "Read only"}`}
    onRetry={() => setRetrySequence((sequence) => sequence + 1)}
    renderItem={(item) => <TranscriptItem item={item} assistantLabel="Prime Agent" />}
    footer={interactive ? <ChatComposer state={state} /> : undefined}
  />;
}
