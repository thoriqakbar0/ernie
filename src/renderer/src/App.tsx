import { Agentation } from "agentation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, WheelEvent } from "react";
import type { AgentSlashCommand } from "../../shared/commands";
import type { AgentState } from "../../shared/contract";
import type { WorkspaceSnapshot } from "../../shared/workspace";
import { ComposerAutocomplete, matchingCommands } from "./ComposerAutocomplete";
import { assistantText } from "./transcript";
import { NewThreadLauncher } from "./NewThreadLauncher";
import { RemoteExecutionControl } from "./RemoteExecutionControl";
import { StartupComposer, StartupRail, useStartupStoryboard } from "./StartupExperience";
import { useTranscript } from "./useTranscript";
import { AgentOverview, AgentTabChooser, DetachedAgentOverview, WorkspaceTabStrip, WorkspaceTree, WorktreeManager, WorktreeManagerDialog, type WorkspaceLoadState } from "./WorkspaceChrome";
import { initialWorkspaceTabs, resolveRootTabStatus, resolveWorkspaceTabSurface, workspaceTabsReducer } from "./workspaceTabs";

const EMPTY_WORKSPACE: WorkspaceSnapshot = { worktrees: [], agents: [], updatedAt: new Date(0).toISOString() };

const EMPTY_STATE: AgentState = {
  connection: "starting", detail: "Starting Prime Agent", sessionId: "", sessionName: "",
  provider: "", modelId: "", modelName: "Discovering model", thinkingLevel: "", executionTarget: "local", isStreaming: false,
  isCompacting: false, messageCount: 0, queuedCount: 0, contextTokens: 0, contextWindow: 0,
  contextPercent: 0, totalTokens: 0, cost: "$0.0000",
};

function Icon({ name, size = 16 }: { readonly name: "menu" | "plus" | "stop" | "send" | "spark"; readonly size?: number }) {
  const paths: Record<typeof name, React.ReactNode> = {
    menu: <><path d="M5 7h14M5 12h14M5 17h14" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    stop: <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none" />,
    send: <><path d="m5 12 14-7-5 14-2.8-5.9z" /><path d="M11.2 13.1 19 5" /></>,
    spark: <><path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

export function App() {
  const [state, setState] = useState(EMPTY_STATE);
  const transcript = useTranscript();
  const { items } = transcript;
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<WorkspaceSnapshot>(EMPTY_WORKSPACE);
  const [workspaceLoadState, setWorkspaceLoadState] = useState<WorkspaceLoadState>("loading");
  const [workspaceTabs, dispatchWorkspaceTab] = useReducer(workspaceTabsReducer, undefined, () => initialWorkspaceTabs({ agentId: "current", worktreeId: "current", title: "ernie" }));
  const [tabChooserOpen, setTabChooserOpen] = useState(false);
  const [worktreeManagerOpen, setWorktreeManagerOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [availableCommands, setAvailableCommands] = useState<readonly AgentSlashCommand[]>([]);
  const [commandIndex, setCommandIndex] = useState(0);
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [newThreadReturnsToRail, setNewThreadReturnsToRail] = useState(false);
  const [newThreadBusy, setNewThreadBusy] = useState(false);
  const [newThreadError, setNewThreadError] = useState("");
  const [accessibilityStatus, setAccessibilityStatus] = useState({ sequence: 0, text: "" });
  const appShellRef = useRef<HTMLDivElement>(null);
  const railToggleRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const composerWrapRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);
  const [isFollowing, setIsFollowing] = useState(true);
  const isStarting = state.connection === "starting";
  const startupStage = useStartupStoryboard(isStarting);
  const commandMatches = useMemo(() => commandMenuDismissed ? [] : matchingCommands(availableCommands, draft), [availableCommands, commandMenuDismissed, draft]);

  useEffect(() => {
    let active = true;
    void window.ernie.getState().then((snapshot) => { if (active && snapshot) setState(snapshot); });
    void window.ernie.getWorkspace().then((snapshot) => { if (active) {
      setWorkspaceSnapshot(snapshot);
      if (snapshot.updatedAt !== EMPTY_WORKSPACE.updatedAt) setWorkspaceLoadState("ready");
      dispatchWorkspaceTab({ type: "sync_agents", agents: snapshot.agents });
    } }).catch(() => { if (active) setWorkspaceLoadState("error"); });
    const unsubscribe = window.ernie.onAgentEvent((event) => {
      transcript.handleEvent(event);
      if (event.kind === "workspace") {
        setWorkspaceLoadState("ready");
        setWorkspaceSnapshot(event.snapshot);
        dispatchWorkspaceTab({ type: "sync_agents", agents: event.snapshot.agents });
        return;
      }
      if (event.kind === "state") {
        setState(event.state);
        if (!event.state.isStreaming) transcript.finish();
        return;
      }
      if (event.kind === "error" && event.source === "workspace_catalog") setWorkspaceLoadState("error");
      if (event.kind === "connection") {
        setState((current) => ({ ...current, connection: event.state, detail: event.detail }));
        if (event.state === "failed" || event.state === "closed") transcript.finish();
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [transcript.handleEvent, transcript.finish]);

  useEffect(() => {
    const rootAgent = workspaceSnapshot.agents.find((agent) => agent.sessionId === state.sessionId);
    const fallbackWorktree = workspaceSnapshot.worktrees[0];
    dispatchWorkspaceTab({
      type: "sync_root",
      agentId: rootAgent?.id ?? (state.sessionId || "current"),
      worktreeId: rootAgent?.worktreeId ?? fallbackWorktree?.id ?? "current",
      title: state.sessionName || rootAgent?.name || fallbackWorktree?.label || "Current agent",
      status: resolveRootTabStatus(state.connection === "ready", state.isStreaming, rootAgent?.status),
    });
  }, [state.connection, state.isStreaming, state.sessionId, state.sessionName, workspaceSnapshot]);

  useEffect(() => {
    if (state.connection !== "ready") return;
    let active = true;
    void window.ernie.getCommands()
      .then((commands) => { if (active) setAvailableCommands(commands); })
      .catch(() => { if (active) setAvailableCommands([]); });
    return () => { active = false; };
  }, [state.connection]);

  useEffect(() => {
    setCommandIndex(0);
    setCommandMenuDismissed(false);
  }, [draft]);

  useEffect(() => {
    const label = state.connection === "ready" ? "Connected." : state.connection === "starting" ? "Connecting." : "Connection unavailable.";
    setAccessibilityStatus((current) => ({ sequence: current.sequence + 1, text: label }));
  }, [state.connection]);

  useEffect(() => {
    if (transcript.announcement.text) setAccessibilityStatus(transcript.announcement);
  }, [transcript.announcement]);

  useEffect(() => {
    document.title = `${workspaceTabs.tabs.find((tab) => tab.id === workspaceTabs.activeTabId)?.title ?? "Ernie"} — Ernie`;
  }, [workspaceTabs.activeTabId, workspaceTabs.tabs]);

  useLayoutEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const height = Math.min(textarea.scrollHeight, 170);
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = textarea.scrollHeight > 170 ? "auto" : "hidden";
  }, [draft, isStarting]);

  useLayoutEffect(() => {
    const shell = appShellRef.current;
    const composer = composerWrapRef.current;
    if (!shell || !composer) return;
    const updateHeight = () => shell.style.setProperty("--composer-height", `${composer.getBoundingClientRect().height}px`);
    updateHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(composer);
    return () => observer.disconnect();
  }, [isStarting]);

  useEffect(() => {
    if (!railOpen) return;
    const rail = railRef.current;
    const focusableSelector = "button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";
    const focusable = () => Array.from(rail?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter((element) => element.getClientRects().length > 0);
    requestAnimationFrame(() => focusable()[0]?.focus());
    const keyDown = (event: globalThis.KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setRailOpen(false);
        requestAnimationFrame(() => railToggleRef.current?.focus());
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !rail?.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !rail?.contains(document.activeElement))) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [railOpen]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 841px)");
    const update = () => { if (media.matches) setRailOpen(false); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const keyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "n") return;
      event.preventDefault();
      if (state.connection === "ready") {
        setNewThreadReturnsToRail(false);
        setNewThreadError("");
        setNewThreadOpen(true);
      }
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [state.connection]);

  useLayoutEffect(() => {
    const viewport = transcriptRef.current;
    if (!viewport || !shouldFollowRef.current) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [items]);

  const transcriptScroll = () => {
    const viewport = transcriptRef.current;
    if (!viewport) return;
    const next = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 48;
    if (next === shouldFollowRef.current) return;
    shouldFollowRef.current = next;
    setIsFollowing(next);
  };

  const stopFollowing = useCallback(() => {
    shouldFollowRef.current = false;
    setIsFollowing(false);
  }, []);

  const transcriptWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) stopFollowing();
  };

  const followLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    shouldFollowRef.current = true;
    setIsFollowing(true);
    const viewport = transcriptRef.current;
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }, []);

  const send = useCallback(async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setComposerError("");
    followLatest();
    transcript.appendUser(trimmed);
    setDraft("");
    try {
      const result = await window.ernie.command({ type: "prompt", message: trimmed, behavior: state.isStreaming ? "steer" : "now" });
      if (!result.ok) setComposerError("Unable to send your message. Check your connection and try again.");
    } catch {
      setComposerError("Unable to send your message. Check your connection and try again.");
    }
  }, [followLatest, state.isStreaming, transcript.appendUser]);

  const chooseCommand = useCallback((command: AgentSlashCommand) => {
    setDraft(`/${command.name} `);
    setCommandMenuDismissed(true);
  }, []);

  const submit = (event: FormEvent) => { event.preventDefault(); void send(draft); };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (commandMatches.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setCommandIndex((current) => (current + direction + commandMatches.length) % commandMatches.length);
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing)) {
        event.preventDefault();
        const command = commandMatches[Math.min(commandIndex, commandMatches.length - 1)];
        if (command) chooseCommand(command);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCommandMenuDismissed(true);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault(); void send(draft);
    }
  };
  const createThread = async (firstPrompt: string | undefined) => {
    setNewThreadBusy(true);
    setNewThreadError("");
    let result;
    try {
      result = await window.ernie.command({ type: "new_session" });
    } catch {
      setNewThreadError("Unable to start a new thread. Check your connection and try again.");
      setNewThreadBusy(false);
      return;
    }
    if (!result.ok || result.cancelled) {
      setNewThreadError(result.cancelled ? "New thread creation was cancelled. Your current thread is unchanged." : "Unable to start a new thread. Check your connection and try again.");
      setNewThreadBusy(false);
      return;
    }
    transcript.reset();
    followLatest();
    setComposerError("");
    setNewThreadOpen(false);
    setNewThreadBusy(false);
    if (firstPrompt === undefined) return;
    transcript.appendUser(firstPrompt);
    try {
      const promptResult = await window.ernie.command({ type: "prompt", message: firstPrompt, behavior: "now" });
      if (!promptResult.ok) setComposerError("The new thread started, but your message was not sent. Try sending it again.");
    } catch {
      setComposerError("The new thread started, but your message was not sent. Try sending it again.");
    }
  };
  const stop = () => { void window.ernie.command({ type: "abort" }); };
  const changeExecutionTarget = async (target: "local" | "modal") => {
    setComposerError("");
    try {
      const result = await window.ernie.command({ type: "set_execution_target", target });
      if (!result.ok) setComposerError(`Unable to switch to ${target === "modal" ? "Modal" : "Local"}. Check your connection and try again.`);
    } catch {
      setComposerError("Unable to switch the IPython runtime. Check your connection and try again.");
    }
  };
  const isExecutionSwitching = state.switchingExecutionTo !== undefined;
  const executionControlDisabled = state.connection !== "ready" || state.isStreaming || state.isCompacting || isExecutionSwitching;
  const statusLabel = state.connection === "ready" ? (state.isStreaming ? "Working" : "Ready") : state.connection === "starting" ? "Connecting" : "Offline";
  const hasConversation = items.length > 0;
  const activeSurface = resolveWorkspaceTabSurface(workspaceTabs, workspaceSnapshot.agents);
  const activeTab = activeSurface.tab;
  const selectedAgent = activeSurface.kind === "agent" ? activeSurface.agent : undefined;
  const activeAgentId = selectedAgent?.id ?? activeTab.agentId;

  return <div className="app-shell" ref={appShellRef}>
    <a className="skip-link" href="#workspace-main">Skip to workspace</a>
    <aside ref={railRef} id="workspace-rail" className={`project-rail ${isStarting ? "is-starting" : ""} ${railOpen ? "is-open" : ""}`} role={railOpen ? "dialog" : undefined} aria-modal={railOpen || undefined} aria-label={railOpen ? "Workspace navigation" : undefined}>
      <div className="titlebar-drag" aria-hidden="true" />
      <button className="new-thread" disabled={state.connection !== "ready"} onClick={() => { setNewThreadReturnsToRail(railOpen); if (railOpen) setRailOpen(false); setNewThreadError(""); setNewThreadOpen(true); }}><Icon name="plus" size={15} /><span>New thread</span><kbd>⌘N</kbd></button>
      <WorkspaceTree
        snapshot={workspaceSnapshot}
        currentSessionId={state.sessionId}
        activeAgentId={activeAgentId}
        onOpenAgent={(agent) => { dispatchWorkspaceTab({ type: "open_agent", agent }); setRailOpen(false); requestAnimationFrame(() => document.getElementById(`workspace-tab-agent:${agent.id}`)?.focus()); }}
        loadState={workspaceLoadState}
      />
      <div className="rail-runtime">
        <RemoteExecutionControl
          executionTarget={state.executionTarget}
          switchingExecutionTo={state.switchingExecutionTo}
          disabled={executionControlDisabled}
          onSelect={changeExecutionTarget}
        />
      </div>
      <div className="rail-spacer" />
      <WorktreeManager active={worktreeManagerOpen} onOpen={() => { if (railOpen) railToggleRef.current?.focus(); setWorktreeManagerOpen(true); setRailOpen(false); }} />
      {isStarting
        ? <StartupRail stage={startupStage} />
        : <div className="rail-status"><span className={`status-dot ${state.connection}`} /><span>{statusLabel}</span><span className="rail-model">{state.modelName}</span></div>}
    </aside>
    {railOpen && <button type="button" className="rail-backdrop" tabIndex={-1} aria-label="Close workspace navigation" onClick={() => { setRailOpen(false); railToggleRef.current?.focus(); }} />}

    <main className="workspace" id="workspace-main" tabIndex={-1} inert={railOpen ? true : undefined}>
      <header className="workspace-toolbar titlebar-drag">
        <button
          ref={railToggleRef}
          type="button"
          className="rail-toggle no-drag"
          aria-label="Toggle workspace navigation"
          aria-controls="workspace-rail"
          aria-expanded={railOpen}
          onClick={() => setRailOpen((current) => !current)}
        ><Icon name="menu" size={17} /></button>
        <WorkspaceTabStrip
          tabs={workspaceTabs.tabs}
          activeTabId={workspaceTabs.activeTabId}
          onSelect={(tabId) => dispatchWorkspaceTab({ type: "select", tabId })}
          onClose={(tabId) => dispatchWorkspaceTab({ type: "close", tabId })}
          onAdd={() => setTabChooserOpen(true)}
        />
      </header>

      <div
        className="workspace-panel"
        role="tabpanel"
        id={`workspace-panel-${activeTab.id}`}
        aria-labelledby={`workspace-tab-${activeTab.id}`}
      >
      {activeSurface.kind === "agent" ? <AgentOverview agent={activeSurface.agent} />
      : activeSurface.kind === "detached" ? <DetachedAgentOverview tab={activeSurface.tab} />
      : <>
      <div className="transcript" ref={transcriptRef} onScroll={transcriptScroll} onWheel={transcriptWheel} role="region" aria-label="Conversation" aria-busy={state.isStreaming}>
        {!hasConversation && <section className="welcome">
          <div className="welcome-mark"><Icon name="spark" size={23} /></div>
          <h1>What would you like to work on?</h1>
          <p>Ask Prime Agent to inspect the project, make a change, or continue an existing task.</p>
          <div className="suggestions">
            {["Explain this codebase", "Find the next useful improvement", "Run the project checks"].map((suggestion) => <button key={suggestion} onClick={() => void send(suggestion)} disabled={state.connection !== "ready"}>{suggestion}</button>)}
          </div>
        </section>}
        {items.map((item) => {
          if (item.kind === "tool") return <details className={`tool-item ${item.isError ? "error" : ""}`} data-phase={item.phase} key={item.id} open={item.phase !== "end"}><summary><span className="tool-indicator" />{item.name}<span className="tool-phase">{item.phase === "end" ? (item.isError ? "failed" : "done") : "running"}</span></summary>{item.detail && <pre>{item.detail}</pre>}</details>;
          if (item.kind === "delegation") return <details className={`delegation-item ${item.status}`} key={item.id} open={item.status === "running" || item.status === "error"}>
            <summary><span className="delegation-glyph" aria-hidden="true">↳</span><span className="delegation-copy"><strong>{item.name}</strong><small>{item.task || "Delegated work"}</small></span><span className="delegation-status">{item.status}</span></summary>
            {item.detail && <div className="delegation-detail">{item.detail}</div>}
          </details>;
          if (item.kind === "notice") return <div className={`notice ${item.tone}`} key={item.id}>{item.text}</div>;
          if (item.kind === "user") return <article className="message user" key={item.id}><div className="message-role">You</div><div className="message-copy">{item.text}</div></article>;
          const text = assistantText(item);
          return <article className="message assistant" key={item.id}><div className="message-role">Ernie</div><div className="message-copy">{text}{item.active && <span className="stream-cursor" aria-label="Streaming" />}</div></article>;
        })}
      </div>

      <div className="composer-wrap" ref={composerWrapRef}>
        {!isStarting && <ComposerAutocomplete commands={commandMatches} activeIndex={commandIndex} onActiveIndexChange={setCommandIndex} onChoose={chooseCommand} />}
        {!isFollowing && <button type="button" className="jump-latest" onClick={() => followLatest(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth")}><span className="jump-live-dot" />Jump to latest</button>}
        {isStarting ? <StartupComposer stage={startupStage} /> : <form className="composer" onSubmit={submit}>
          <textarea ref={composerTextareaRef} aria-label="Message Prime Agent" role="combobox" aria-autocomplete="list" aria-expanded={commandMatches.length > 0} aria-controls={commandMatches.length > 0 ? "prime-command-menu" : undefined} aria-activedescendant={commandMatches.length > 0 ? `command-option-${commandIndex}` : undefined} placeholder={isExecutionSwitching ? "Switching IPython runtime…" : state.connection === "ready" ? "Message Prime Agent…" : "Prime Agent is offline. Reconnect to send a message."} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} rows={1} disabled={state.connection !== "ready" || isExecutionSwitching} />
          <div className="composer-footer">
            <div className="usage"><span>{state.contextPercent}% context</span><span>·</span><span>{formatTokens(state.totalTokens)} {state.totalTokens === 1 ? "token" : "tokens"}</span><span>·</span><span>{state.cost}</span></div>
            {state.isStreaming ? <button type="button" className="send-button stop" aria-label="Stop response" onClick={stop}><Icon name="stop" size={15} /></button> : <button type="submit" className="send-button" aria-label="Send message" disabled={!draft.trim() || state.connection !== "ready" || isExecutionSwitching}><Icon name="send" size={16} /></button>}
          </div>
        </form>}
        {composerError && <div className="composer-error" role="alert">{composerError}</div>}
      </div>
      </>}
      </div>
    </main>
    <div className="sr-only" aria-live="polite" aria-atomic="true"><span key={accessibilityStatus.sequence}>{accessibilityStatus.text}</span></div>

    <WorktreeManagerDialog
      open={worktreeManagerOpen}
      snapshot={workspaceSnapshot}
      onClose={() => setWorktreeManagerOpen(false)}
      onNewThread={() => { setNewThreadReturnsToRail(false); setWorktreeManagerOpen(false); setNewThreadError(""); setNewThreadOpen(true); }}
      loadState={workspaceLoadState}
    />
    <AgentTabChooser
      open={tabChooserOpen}
      snapshot={workspaceSnapshot}
      onClose={() => setTabChooserOpen(false)}
      onChoose={(agent) => { dispatchWorkspaceTab({ type: "open_agent", agent }); setTabChooserOpen(false); }}
      loadState={workspaceLoadState}
    />
    <NewThreadLauncher
      open={newThreadOpen}
      busy={newThreadBusy}
      error={newThreadError}
      returnFocusRef={newThreadReturnsToRail ? railToggleRef : undefined}
      onClose={() => { setNewThreadOpen(false); setNewThreadError(""); }}
      onCreate={createThread}
    />
    {import.meta.env.DEV && <Agentation onSubmit={(output) => void send(output)} />}
  </div>;
}
