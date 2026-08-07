import { Agentation } from "agentation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, AgentState } from "../../shared/contract";

type ThreadItem =
  | { readonly id: string; readonly kind: "user" | "assistant"; readonly text: string }
  | { readonly id: string; readonly kind: "tool"; readonly callId: string; readonly name: string; readonly detail: string; readonly phase: "start" | "update" | "end"; readonly isError: boolean }
  | { readonly id: string; readonly kind: "notice"; readonly text: string; readonly tone: "neutral" | "error" };

const EMPTY_STATE: AgentState = {
  connection: "starting", detail: "Launching Prime Agent RPC", sessionId: "", sessionName: "",
  provider: "", modelId: "", modelName: "Discovering model", thinkingLevel: "", isStreaming: false,
  isCompacting: false, messageCount: 0, queuedCount: 0, contextTokens: 0, contextWindow: 0,
  contextPercent: 0, totalTokens: 0, cost: "$0.0000",
};

function Icon({ name, size = 16 }: { readonly name: "plus" | "chat" | "code" | "chevron" | "stop" | "send" | "spark" | "refresh"; readonly size?: number }) {
  const paths: Record<typeof name, React.ReactNode> = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></>,
    code: <><path d="m8 9-4 3 4 3m8-6 4 3-4 3m-2-10-4 14" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    stop: <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none" />,
    send: <><path d="m5 12 14-7-5 14-2.8-5.9z" /><path d="M11.2 13.1 19 5" /></>,
    spark: <><path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M18.5 17a8 8 0 1 1 1.2-8L20 12" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function itemFromEvent(event: AgentEvent): ThreadItem | null {
  if (event.kind === "error") return { id: crypto.randomUUID(), kind: "notice", text: event.message, tone: "error" };
  return null;
}

export function App() {
  const [state, setState] = useState(EMPTY_STATE);
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [draft, setDraft] = useState("");
  const [composerError, setComposerError] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);

  useEffect(() => {
    let active = true;
    void window.ernie.getState().then((snapshot) => { if (active && snapshot) setState(snapshot); });
    const unsubscribe = window.ernie.onAgentEvent((event) => {
      if (event.kind === "state") { setState(event.state); return; }
      if (event.kind === "connection") {
        setState((current) => ({ ...current, connection: event.state, detail: event.detail }));
        return;
      }
      if (event.kind === "assistant_delta") {
        setItems((current) => {
          const last = current.at(-1);
          if (last?.kind === "assistant") return [...current.slice(0, -1), { ...last, text: last.text + event.delta }];
          return [...current, { id: crypto.randomUUID(), kind: "assistant", text: event.delta }];
        });
        return;
      }
      if (event.kind === "tool") {
        setItems((current) => {
          const index = current.findIndex((item) => item.kind === "tool" && item.callId === event.callId);
          const previous = index >= 0 && current[index]?.kind === "tool" ? current[index] : null;
          const next: ThreadItem = { id: previous?.id ?? crypto.randomUUID(), kind: "tool", callId: event.callId, name: event.name || previous?.name || "Tool", detail: event.detail, phase: event.phase, isError: event.isError };
          if (index < 0) return [...current, next];
          return current.map((item, itemIndex) => itemIndex === index ? next : item);
        });
        return;
      }
      const item = itemFromEvent(event);
      if (item) setItems((current) => [...current, item]);
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    const viewport = transcriptRef.current;
    if (!viewport || !shouldFollowRef.current) return;
    requestAnimationFrame(() => viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" }));
  }, [items]);

  const transcriptScroll = () => {
    const viewport = transcriptRef.current;
    if (!viewport) return;
    shouldFollowRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120;
  };

  const send = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setComposerError("");
    setItems((current) => [...current, { id: crypto.randomUUID(), kind: "user", text: trimmed }]);
    setDraft("");
    const result = await window.ernie.command({ type: "prompt", message: trimmed, behavior: state.isStreaming ? "steer" : "now" });
    if (!result.ok) setComposerError(result.error ?? "Prime Agent rejected the message");
  }, [state.isStreaming]);

  const submit = (event: FormEvent) => { event.preventDefault(); void send(draft); };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault(); void send(draft);
    }
  };
  const newThread = async () => {
    const result = await window.ernie.command({ type: "new_session" });
    if (result.ok && !result.cancelled) { setItems([]); setComposerError(""); }
  };
  const stop = () => { void window.ernie.command({ type: "abort" }); };
  const statusLabel = state.connection === "ready" ? (state.isStreaming ? "Working" : "Ready") : state.connection === "starting" ? "Connecting" : "Offline";
  const hasConversation = items.length > 0;
  const projectLabel = useMemo(() => "ernie", []);

  return <div className="app-shell">
    <aside className="project-rail">
      <div className="titlebar-drag" aria-hidden="true" />
      <button className="new-thread" onClick={newThread}><Icon name="plus" size={15} /><span>New thread</span><kbd>⌘N</kbd></button>
      <div className="rail-section-label">Project</div>
      <button className="project-row active"><Icon name="code" size={15} /><span>{projectLabel}</span><Icon name="chevron" size={13} /></button>
      <div className="rail-section-label thread-heading">Threads</div>
      <button className="thread-row active"><Icon name="chat" size={14} /><span>{state.sessionName || "Current thread"}</span></button>
      <div className="rail-spacer" />
      <div className="rail-status"><span className={`status-dot ${state.connection}`} /><span>{statusLabel}</span><span className="rail-model">{state.modelName}</span></div>
    </aside>

    <main className="workspace">
      <header className="workspace-toolbar titlebar-drag">
        <div className="toolbar-title no-drag"><span>{projectLabel}</span><span className="slash">/</span><span>{state.sessionName || "Current thread"}</span></div>
        <div className="toolbar-actions no-drag">
          <button className="text-control" onClick={() => void window.ernie.command({ type: "cycle_model" })}>{state.modelName}</button>
          <button className="text-control thinking" onClick={() => void window.ernie.command({ type: "cycle_thinking_level" })}>{state.thinkingLevel || "thinking"}</button>
          <button className="icon-control" aria-label="Refresh session state" onClick={() => void window.ernie.command({ type: "refresh" })}><Icon name="refresh" size={14} /></button>
        </div>
      </header>

      <div className="transcript" ref={transcriptRef} onScroll={transcriptScroll}>
        {!hasConversation && <section className="welcome">
          <div className="welcome-mark"><Icon name="spark" size={23} /></div>
          <h1>What should we build?</h1>
          <p>Ask Prime Agent to inspect the project, ship a change, or annotate this interface directly.</p>
          <div className="suggestions">
            {["Explain this codebase", "Find the next useful improvement", "Run the project checks"].map((suggestion) => <button key={suggestion} onClick={() => void send(suggestion)}>{suggestion}</button>)}
          </div>
        </section>}
        {items.map((item) => {
          if (item.kind === "tool") return <details className={`tool-item ${item.isError ? "error" : ""}`} key={item.id} open={item.phase !== "end"}><summary><span className="tool-indicator" />{item.name}<span className="tool-phase">{item.phase === "end" ? (item.isError ? "failed" : "done") : "running"}</span></summary>{item.detail && <pre>{item.detail}</pre>}</details>;
          if (item.kind === "notice") return <div className={`notice ${item.tone}`} key={item.id}>{item.text}</div>;
          return <article className={`message ${item.kind}`} key={item.id}><div className="message-role">{item.kind === "user" ? "You" : "Ernie"}</div><div className="message-copy">{item.text || <span className="stream-cursor" />}</div></article>;
        })}
      </div>

      <div className="composer-wrap">
        <form className="composer" onSubmit={submit}>
          <textarea aria-label="Message Prime Agent" placeholder={state.connection === "ready" ? "Message Prime Agent…" : state.detail} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} rows={1} disabled={state.connection !== "ready"} />
          <div className="composer-footer">
            <div className="usage"><span>{state.contextPercent}% context</span><span>·</span><span>{formatTokens(state.totalTokens)} tokens</span><span>·</span><span>{state.cost}</span></div>
            {state.isStreaming ? <button type="button" className="send-button stop" aria-label="Stop response" onClick={stop}><Icon name="stop" size={15} /></button> : <button type="submit" className="send-button" aria-label="Send message" disabled={!draft.trim() || state.connection !== "ready"}><Icon name="send" size={16} /></button>}
          </div>
        </form>
        {composerError && <div className="composer-error" role="alert">{composerError}</div>}
      </div>
    </main>

    {import.meta.env.DEV && <Agentation copyToClipboard={false} onSubmit={(output) => void send(output)} />}
  </div>;
}
