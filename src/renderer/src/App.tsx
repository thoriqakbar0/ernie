import { Agentation } from "agentation";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, WheelEvent } from "react";
import type { AgentSlashCommand } from "../../shared/commands";
import type { AgentState } from "../../shared/contract";
import type { SessionTranscriptEvent } from "../../shared/sessionTranscript";
import type { WorkspaceAgent, WorkspaceSnapshot } from "../../shared/workspace";
import { ComposerAutocomplete, matchingCommands } from "./ComposerAutocomplete";
import { assistantText, type ThreadItem } from "./transcript";
import { NewThreadLauncher } from "./NewThreadLauncher";
import { LocalRuntimeRecovery } from "./LocalRuntimeRecovery";
import { IPythonExecutionCard } from "./IPythonExecutionCard";
import { VirtualAgentExplorer } from "./VirtualAgentExplorer";
import { VirtualTranscript } from "./VirtualTranscript";
import { SessionTranscriptView } from "./SessionTranscriptView";
import { AccessibleTranscriptDialog } from "./AccessibleTranscriptDialog";
import { sessionTranscriptReducer } from "./sessionTranscript";
import { DevServerPanel } from "./DevServerPanel";
import { StartupComposer, StartupRail, useStartupStoryboard } from "./StartupExperience";
import { useTranscript } from "./useTranscript";
import { AgentOverview, AgentTabChooser, DetachedAgentOverview, EmptyWorktreeOverview, WorkspaceTabStrip, WorktreeManager, WorktreeManagerDialog, type WorkspaceLoadState } from "./WorkspaceChrome";
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
  const [sessionItems, dispatchSessionTranscript] = useReducer(sessionTranscriptReducer, []);
  const [sessionTranscriptState, setSessionTranscriptState] = useState<"loading" | "ready" | "error">("loading");
  const [sessionRetryNonce, setSessionRetryNonce] = useState(0);
  const [sessionAccessibilityStatus, setSessionAccessibilityStatus] = useState("");
  const selectedSessionRef = useRef<string | undefined>(undefined);
  const [tabChooserOpen, setTabChooserOpen] = useState(false);
  const [worktreeManagerOpen, setWorktreeManagerOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
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
  const browserToggleRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const composerWrapRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);
  const [isFollowing, setIsFollowing] = useState(true);
  const closeBrowser = useCallback(() => {
    setBrowserOpen(false);
    requestAnimationFrame(() => browserToggleRef.current?.focus());
  }, []);
  const isStarting = state.connection === "starting";
  const startupStage = useStartupStoryboard(isStarting);
  const commandMatches = useMemo(() => commandMenuDismissed ? [] : matchingCommands(availableCommands, draft), [availableCommands, commandMenuDismissed, draft]);

  useEffect(() => window.ernie.onSessionTranscriptEvent((event: SessionTranscriptEvent) => {
    if (event.activeSessionId !== selectedSessionRef.current) return;
    dispatchSessionTranscript(event);
    if (event.kind === "snapshot") {
      setSessionTranscriptState("ready");
      setSessionAccessibilityStatus("Selected session transcript loaded.");
    } else if (event.kind === "assistant_end") setSessionAccessibilityStatus("Selected session message completed.");
    else if (event.kind === "tool" && event.phase === "end") setSessionAccessibilityStatus(`${event.name} ${event.status === "failed" ? "failed" : "completed"} in the selected session.`);
    else if (event.kind === "closed") {
      setSessionTranscriptState("error");
      setSessionAccessibilityStatus("Live updates for the selected session stopped.");
    }
  }), []);

  useEffect(() => {
    let active = true;
    void window.ernie.getState().then((snapshot) => { if (active && snapshot) setState(snapshot); });
    void window.ernie.getWorkspace().then((snapshot) => { if (active) {
      setWorkspaceSnapshot(snapshot);
      if (snapshot.updatedAt !== EMPTY_WORKSPACE.updatedAt) setWorkspaceLoadState("ready");
      dispatchWorkspaceTab({ type: "sync_workspace", worktrees: snapshot.worktrees, agents: snapshot.agents });
    } }).catch(() => { if (active) setWorkspaceLoadState("error"); });
    const unsubscribe = window.ernie.onAgentEvent((event) => {
      transcript.handleEvent(event);
      if (event.kind === "workspace") {
        setWorkspaceLoadState("ready");
        setWorkspaceSnapshot(event.snapshot);
        dispatchWorkspaceTab({ type: "sync_workspace", worktrees: event.snapshot.worktrees, agents: event.snapshot.agents });
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
  const localOnlyBlocked = state.executionTarget !== "local" || isExecutionSwitching;
  const statusLabel = state.connection === "ready" ? (state.isStreaming ? "Working" : "Ready") : state.connection === "starting" ? "Connecting" : "Offline";
  const activeSurface = resolveWorkspaceTabSurface(workspaceTabs, workspaceSnapshot);
  const activeTab = activeSurface.tab;
  const selectedAgent = activeSurface.kind === "agent" ? activeSurface.agent : undefined;
  const selectedActiveSessionId = selectedAgent?.activeSessionId;
  useEffect(() => {
    selectedSessionRef.current = selectedActiveSessionId;
    if (!selectedActiveSessionId) {
      void window.ernie.detachSessionTranscript().catch(() => undefined);
      return;
    }
    setSessionTranscriptState("loading");
    dispatchSessionTranscript({ kind: "snapshot", activeSessionId: selectedActiveSessionId, items: [], historyTruncated: false });
    let active = true;
    void window.ernie.selectSessionTranscript(selectedActiveSessionId).then((snapshot) => {
      if (!active || selectedSessionRef.current !== selectedActiveSessionId) return;
      void snapshot;
      setSessionTranscriptState("ready");
    }).catch(() => {
      if (active && selectedSessionRef.current === selectedActiveSessionId) setSessionTranscriptState("error");
    });
    return () => { active = false; };
  }, [selectedActiveSessionId, sessionRetryNonce]);
  const activeAgentId = selectedAgent?.id ?? activeTab.selectedAgentId;
  const selectWorkspaceAgent = (agent: WorkspaceAgent) => {
    const worktree = workspaceSnapshot.worktrees.find((candidate) => candidate.id === agent.worktreeId);
    dispatchWorkspaceTab({ type: "open_agent", agent, ...(worktree ? { worktree } : {}) });
  };
  const renderTranscriptItem = (item: ThreadItem, assistantLabel = "Ernie", promptLabel = "You") => {
    if (item.kind === "ipython_execution") return <IPythonExecutionCard execution={item} />;
    if (item.kind === "tool") return <details className={`tool-item ${item.isError ? "error" : ""}`} data-phase={item.phase} key={item.id} open={item.phase !== "end"}><summary><span className="tool-indicator" />{item.name}<span className="tool-phase">{item.phase === "end" ? (item.isError ? "failed" : "done") : "running"}</span></summary>{item.detail && <pre>{item.detail}</pre>}</details>;
    if (item.kind === "delegation") return <details className={`delegation-item ${item.status}`} key={item.id} open={item.status === "running" || item.status === "error"}>
      <summary><span className="delegation-glyph" aria-hidden="true">↳</span><span className="delegation-copy"><strong>{item.name}</strong><small>{item.task || "Delegated work"}</small></span><span className="delegation-status">{item.status}</span></summary>
      {item.detail && <div className="delegation-detail">{item.detail}</div>}
    </details>;
    if (item.kind === "notice") return <div className={`notice ${item.tone}`} key={item.id}>{item.text}</div>;
    if (item.kind === "user") return <article className="message user" key={item.id}><div className="message-role">{promptLabel}</div><div className="message-copy">{item.text}</div></article>;
    const text = assistantText(item);
    return <article className="message assistant" key={item.id}><div className="message-role">{assistantLabel}</div><div className="message-copy">{text}{item.active && <span className="stream-cursor" aria-label="Streaming" />}</div></article>;
  };

  return <div className="app-shell" ref={appShellRef}>
    <a className="skip-link" href="#workspace-main">Skip to workspace</a>
    <aside ref={railRef} id="workspace-rail" className={`project-rail ${isStarting ? "is-starting" : ""} ${railOpen ? "is-open" : ""}`} role={railOpen ? "dialog" : undefined} aria-modal={railOpen || undefined} aria-label={railOpen ? "Workspace navigation" : undefined}>
      <div className="titlebar-drag" aria-hidden="true" />
      <button className="new-thread" disabled={state.connection !== "ready"} onClick={() => { setNewThreadReturnsToRail(railOpen); if (railOpen) setRailOpen(false); setNewThreadError(""); setNewThreadOpen(true); }}><Icon name="plus" size={15} /><span>New root thread</span><kbd>⌘N</kbd></button>
      <VirtualAgentExplorer
        snapshot={workspaceSnapshot}
        currentSessionId={state.sessionId}
        activeAgentId={activeAgentId}
        onOpenAgent={(agent) => { selectWorkspaceAgent(agent); setRailOpen(false); requestAnimationFrame(() => document.getElementById(agent.worktreeId === workspaceTabs.rootWorktreeId ? "workspace-tab-root" : `workspace-tab-worktree:${agent.worktreeId}`)?.focus()); }}
        loadState={workspaceLoadState}
      />
      <div className="rail-runtime">
        {state.executionTarget === "local" && !isExecutionSwitching
          ? <div className="local-runtime" aria-label="IPython runtime: Local"><span>IPython</span><small>Local kernel</small></div>
          : <div className="local-runtime-setup"><small>Switch to Local to continue</small><LocalRuntimeRecovery
              disabled={executionControlDisabled}
              switching={isExecutionSwitching}
              onSwitch={() => changeExecutionTarget("local")}
            /></div>}
      </div>
      <div className="rail-spacer" />
      <WorktreeManager active={worktreeManagerOpen} onOpen={() => {
        if (!railOpen) { setWorktreeManagerOpen(true); return; }
        setRailOpen(false);
        requestAnimationFrame(() => {
          railToggleRef.current?.focus();
          setWorktreeManagerOpen(true);
        });
      }} />
      {isStarting
        ? <StartupRail stage={startupStage} />
        : <div className="rail-status"><span className={`status-dot ${state.connection}`} /><span>{statusLabel}</span><span className="rail-model">{state.modelName}</span></div>}
    </aside>
    {railOpen && <button type="button" className="rail-backdrop" tabIndex={-1} aria-label="Close workspace navigation" onClick={() => { setRailOpen(false); railToggleRef.current?.focus(); }} />}

    <main className={`workspace ${browserOpen ? "browser-open" : ""}`} id="workspace-main" tabIndex={-1} inert={railOpen ? true : undefined}>
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
        <button ref={browserToggleRef} type="button" className={`browser-toggle no-drag ${browserOpen ? "active" : ""}`} aria-pressed={browserOpen} aria-expanded={browserOpen} aria-controls="dev-server-panel" onClick={() => setBrowserOpen((current) => !current)}>Browser</button>
      </header>

      <div
        className="workspace-panel"
        role="tabpanel"
        id={`workspace-panel-${activeTab.id}`}
        aria-labelledby={`workspace-tab-${activeTab.id}`}
      >
      {activeSurface.kind === "agent" ? (activeSurface.agent.activeSessionId
        ? <SessionTranscriptView key={activeSurface.agent.activeSessionId} agent={activeSurface.agent} items={sessionItems} state={sessionTranscriptState} onRetry={() => setSessionRetryNonce((value) => value + 1)} renderItem={(item) => renderTranscriptItem(item, activeSurface.agent.name, "Prompt")} />
        : <AgentOverview agent={activeSurface.agent} />)
      : activeSurface.kind === "empty" ? <EmptyWorktreeOverview worktree={activeSurface.worktree} />
      : activeSurface.kind === "detached" ? <DetachedAgentOverview tab={activeSurface.tab} />
      : <>
      <AccessibleTranscriptDialog items={items} assistantLabel="Ernie" promptLabel="You" />
      <VirtualTranscript
        items={items}
        scrollRef={transcriptRef}
        busy={state.isStreaming}
        onScroll={transcriptScroll}
        onWheel={transcriptWheel}
        renderItem={renderTranscriptItem}
        empty={<section className="welcome">
          <div className="welcome-mark"><Icon name="spark" size={23} /></div>
          <h1>What would you like to work on?</h1>
          <p>Ask Prime Agent to inspect the project, make a change, or continue an existing task.</p>
          <div className="suggestions">
            {["Explain this codebase", "Find the next useful improvement", "Run the project checks"].map((suggestion) => <button key={suggestion} onClick={() => void send(suggestion)} disabled={state.connection !== "ready"}>{suggestion}</button>)}
          </div>
        </section>}
      />

      <div className="composer-wrap" ref={composerWrapRef}>
        {!isStarting && <ComposerAutocomplete commands={commandMatches} activeIndex={commandIndex} onActiveIndexChange={setCommandIndex} onChoose={chooseCommand} />}
        {!isFollowing && <button type="button" className="jump-latest" onClick={() => followLatest(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth")}><span className="jump-live-dot" />Jump to latest</button>}
        {isStarting ? <StartupComposer stage={startupStage} /> : <form className="composer" onSubmit={submit}>
          <textarea ref={composerTextareaRef} aria-label="Message Prime Agent" role="combobox" aria-autocomplete="list" aria-expanded={commandMatches.length > 0} aria-controls={commandMatches.length > 0 ? "prime-command-menu" : undefined} aria-activedescendant={commandMatches.length > 0 ? `command-option-${commandIndex}` : undefined} placeholder={localOnlyBlocked ? "Switch to Local IPython to continue…" : state.connection === "ready" ? "Message Prime Agent…" : "Prime Agent is offline. Reconnect to send a message."} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} rows={1} disabled={state.connection !== "ready" || localOnlyBlocked} />
          <div className="composer-footer">
            <div className="usage"><span>{state.contextPercent}% context</span><span>·</span><span>{formatTokens(state.totalTokens)} {state.totalTokens === 1 ? "token" : "tokens"}</span><span>·</span><span>{state.cost}</span></div>
            {state.isStreaming ? <button type="button" className="send-button stop" aria-label="Stop response" onClick={stop}><Icon name="stop" size={15} /></button> : <button type="submit" className="send-button" aria-label="Send message" disabled={!draft.trim() || state.connection !== "ready" || localOnlyBlocked}><Icon name="send" size={16} /></button>}
          </div>
        </form>}
        {composerError && <div className="composer-error" role="alert">{composerError}</div>}
      </div>
      </>}
      </div>
      <DevServerPanel open={browserOpen} worktreeId={activeTab.worktreeId} worktreeLabel={activeTab.title} onClose={closeBrowser} />
    </main>
    <div className="sr-only" aria-live="polite" aria-atomic="true"><span key={accessibilityStatus.sequence}>{accessibilityStatus.text}</span><span>{sessionAccessibilityStatus}</span></div>

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
      onChooseWorktree={(worktree) => {
        dispatchWorkspaceTab({ type: "open_worktree", worktree });
        setTabChooserOpen(false);
      }}
      onChoose={(agent) => { selectWorkspaceAgent(agent); setTabChooserOpen(false); }}
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
