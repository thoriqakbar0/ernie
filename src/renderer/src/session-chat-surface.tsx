import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { AgentSlashCommand } from "../../shared/commands";
import type { AgentState } from "../../shared/contract";
import type { SessionTranscriptEvent } from "../../shared/sessionTranscript";
import type { WorkspaceAgent } from "../../shared/workspace";
import type { ThreadItem } from "./transcript";
import { ComposerAutocomplete, matchingCommands } from "./composer-autocomplete";
import { sessionTranscriptReducer } from "./sessionTranscript";
import { SessionTranscriptView } from "./session-transcript-view";
import { TranscriptItem } from "./transcript-item";

/** Quiet period that absorbs transient daemon attachment failures. */
export const DAEMON_ERROR_GRACE_MS = 3_000;

function SendIcon({ stop = false }: { readonly stop?: boolean }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true">{stop
    ? <rect x="6" y="6" width="8" height="8" rx="1" fill="currentColor" stroke="none" />
    : <><path d="m3.5 10 13-6-4.6 12-2.1-4.2z" /><path d="m9.8 11.8 6.7-7.8" /></>}</svg>;
}

function assistantSourceLabel(agent: WorkspaceAgent): string {
  return agent.runtimeKind === "subagent" ? `${agent.name} · Subagent` : "Prime Agent";
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function transcriptMessageText(event: Extract<SessionTranscriptEvent, { readonly kind: "user_message" }>): string {
  const segments: string[] = [];
  for (const block of event.message.blocks) segments[block.contentIndex] = block.text;
  return segments.join("");
}

function ChatComposer({ spaceId, state, connectionReady = true, onAppendUser, onAdmissionHint }: {
  readonly spaceId: string;
  readonly state: AgentState;
  readonly connectionReady?: boolean;
  readonly onAppendUser?: (text: string, steered: boolean) => void;
  readonly onAdmissionHint?: (text: string, steered: boolean) => () => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [commands, setCommands] = useState<readonly AgentSlashCommand[]>([]);
  const [commandIndex, setCommandIndex] = useState(0);
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const matches = useMemo(() => commandMenuDismissed ? [] : matchingCommands(commands, draft), [commands, commandMenuDismissed, draft]);
  const runtimeUnavailable = state.connection === "failed" || state.connection === "closed";
  const disabled = !connectionReady || state.connection !== "ready" || state.isCompacting || state.switchingExecutionTo !== undefined;

  useEffect(() => {
    if (state.connection !== "ready") return;
    let active = true;
    void window.ernie.getSpaceCommands(spaceId).then((available) => { if (active) setCommands(available); }).catch(() => { if (active) setCommands([]); });
    return () => { active = false; };
  }, [spaceId, state.connection]);

  useEffect(() => { setCommandIndex(0); setCommandMenuDismissed(false); }, [draft]);

  const send = async () => {
    const message = draft.trim();
    if (!message || disabled) return;
    setError("");
    const steered = state.isStreaming;
    const removeAdmissionHint = onAdmissionHint?.(message, steered);
    try {
      const result = await window.ernie.spaceCommand(spaceId, { type: "prompt", message, behavior: steered ? "steer" : "now" });
      if (result.ok) {
        onAppendUser?.(message, steered);
        setDraft("");
      } else {
        removeAdmissionHint?.();
        setError(result.error ?? "Unable to send this message. Try again.");
      }
    } catch {
      removeAdmissionHint?.();
      setError("Unable to send this message. Try again.");
    }
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
  const placeholder = !connectionReady ? "Reconnecting to Prime Agent…"
    : runtimeUnavailable ? "Prime Agent unavailable"
    : state.isCompacting ? "Compacting conversation…"
    : state.switchingExecutionTo !== undefined ? "Switching execution target…"
    : state.isStreaming ? "Steer the current run…"
    : "Message Prime Agent…";

  return <div className="chat-composer-wrap">
    {runtimeUnavailable && state.detail && <div className="chat-runtime-error" role="alert"><strong>Prime Agent is unavailable</strong><p>{state.detail}</p></div>}
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
          ? <button type="button" className="chat-send stop" aria-label="Stop response" onClick={() => { void window.ernie.spaceCommand(spaceId, { type: "abort" }); }}><SendIcon stop /></button>
          : <button type="submit" className="chat-send" aria-label="Send message" disabled={disabled || draft.trim().length === 0}><SendIcon /></button>}
      </footer>
    </form>
    {error && <p className="chat-composer-error" role="alert">{error}</p>}
  </div>;
}

export function LiveSessionChatSurface({ agent, locationLabel, state, items, onAppendUser, spaceId, assistantSubagentCount, assistantRunningSubagentCount, onShowAssistantHierarchy }: {
  readonly agent: WorkspaceAgent;
  readonly locationLabel: string;
  readonly state: AgentState;
  readonly items: readonly ThreadItem[];
  readonly onAppendUser: (text: string, steered: boolean) => void;
  readonly spaceId: string;
  readonly assistantSubagentCount: number;
  readonly assistantRunningSubagentCount: number;
  readonly onShowAssistantHierarchy: () => void;
}) {
  const runtimeUnavailable = state.connection === "failed" || state.connection === "closed";
  const viewState = runtimeUnavailable ? "unavailable" : state.connection === "starting" ? "loading" : "ready";
  return <SessionTranscriptView
    agent={agent}
    locationLabel={locationLabel}
    items={items}
    state={viewState}
    interactive={state.connection === "ready"}
    onRetry={() => {}}
    renderItem={(item) => <TranscriptItem item={item} assistantLabel={assistantSourceLabel(agent)} assistantSubagentCount={assistantSubagentCount} assistantRunningSubagentCount={assistantRunningSubagentCount} onShowAssistantHierarchy={onShowAssistantHierarchy} />}
    footer={<ChatComposer spaceId={spaceId} state={state} onAppendUser={onAppendUser} />}
  />;
}

export function SessionChatSurface({ agent, locationLabel, state, interactive, spaceId, assistantSubagentCount, assistantRunningSubagentCount, onShowAssistantHierarchy }: {
  readonly agent: WorkspaceAgent;
  readonly locationLabel: string;
  readonly state: AgentState | undefined;
  readonly interactive: boolean;
  readonly spaceId: string | undefined;
  readonly assistantSubagentCount: number;
  readonly assistantRunningSubagentCount: number;
  readonly onShowAssistantHierarchy: () => void;
}) {
  const [items, dispatch] = useReducer(sessionTranscriptReducer, []);
  const [streamState, setStreamState] = useState<"loading" | "reconnecting" | "ready" | "error">("loading");
  const [retrySequence, setRetrySequence] = useState(0);
  const pendingUserAdmissions = useRef<Array<{ readonly text: string; readonly steered: boolean; readonly expiresAt: number }>>([]);
  const activeSessionId = agent.activeSessionId ?? agent.id;

  useEffect(() => {
    let active = true;
    let failureTimer: number | undefined;
    const cancelDelayedFailure = () => {
      if (failureTimer === undefined) return;
      window.clearTimeout(failureTimer);
      failureTimer = undefined;
    };
    const delayFailure = (closedEvent?: Extract<SessionTranscriptEvent, { readonly kind: "closed" }>) => {
      cancelDelayedFailure();
      setStreamState("reconnecting");
      failureTimer = window.setTimeout(() => {
        failureTimer = undefined;
        if (!active) return;
        if (closedEvent) dispatch(closedEvent);
        setStreamState("error");
      }, DAEMON_ERROR_GRACE_MS);
    };
    pendingUserAdmissions.current = [];
    dispatch({ kind: "snapshot", activeSessionId, items: [], historyTruncated: false });
    setStreamState("loading");
    const unsubscribe = window.ernie.onSessionTranscriptEvent((event: SessionTranscriptEvent) => {
      if (!active || event.activeSessionId !== activeSessionId) return;
      if (event.kind === "closed") { delayFailure(event); return; }
      let projectedEvent = event;
      if (event.kind === "user_message") {
        const now = Date.now();
        pendingUserAdmissions.current = pendingUserAdmissions.current.filter((candidate) => candidate.expiresAt > now);
        const messageText = transcriptMessageText(event);
        const hintIndex = pendingUserAdmissions.current.findIndex((candidate) => candidate.text === messageText);
        const hint = hintIndex < 0 ? undefined : pendingUserAdmissions.current.splice(hintIndex, 1)[0];
        if (hint) projectedEvent = { ...event, message: { ...event.message, steered: hint.steered } };
      }
      dispatch(projectedEvent);
      if (event.kind === "connection" && event.state === "reconnecting") setStreamState("reconnecting");
      else {
        cancelDelayedFailure();
        setStreamState("ready");
      }
    });
    void window.ernie.selectSessionTranscript(activeSessionId)
      .then((snapshot) => {
        if (!active) return;
        cancelDelayedFailure();
        dispatch(snapshot);
        setStreamState("ready");
      })
      .catch(() => { if (active) delayFailure(); });
    return () => {
      active = false;
      cancelDelayedFailure();
      unsubscribe();
      void window.ernie.detachSessionTranscript();
    };
  }, [activeSessionId, retrySequence]);

  const runtimeUnavailable = interactive && (state === undefined || state.connection === "failed" || state.connection === "closed");
  const surfaceState = runtimeUnavailable ? "unavailable" : streamState;
  return <SessionTranscriptView
    agent={agent}
    locationLabel={locationLabel}
    items={items}
    state={surfaceState}
    interactive={interactive && !runtimeUnavailable}
    onRetry={() => setRetrySequence((sequence) => sequence + 1)}
    renderItem={(item) => <TranscriptItem item={item} assistantLabel={assistantSourceLabel(agent)} assistantSubagentCount={assistantSubagentCount} assistantRunningSubagentCount={assistantRunningSubagentCount} onShowAssistantHierarchy={onShowAssistantHierarchy} />}
    footer={interactive && state && spaceId ? <ChatComposer spaceId={spaceId} state={state} connectionReady={streamState === "ready"} onAdmissionHint={(text, steered) => {
      const hint = { text, steered, expiresAt: Date.now() + 30_000 };
      pendingUserAdmissions.current = [...pendingUserAdmissions.current.slice(-7), hint];
      return () => { pendingUserAdmissions.current = pendingUserAdmissions.current.filter((candidate) => candidate !== hint); };
    }} /> : undefined}
  />;
}
