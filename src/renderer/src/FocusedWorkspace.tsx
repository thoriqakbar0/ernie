import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import type { AgentState } from "../../shared/contract";
import type { AgentModelOption, SpaceRuntimeState } from "../../shared/spaceRuntime";
import type { WorkspaceAgent, WorkspaceProject, WorkspaceSnapshot } from "../../shared/workspace";
import { LiveSessionChatSurface, SessionChatSurface } from "./SessionChatSurface";
import { SpaceLaunchpad } from "./SpaceLaunchpad";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { Icon } from "./WorkspaceIcon";
import { countEngagedAgentDescendants, projectForAgent, statusText } from "./workspaceAgentPresentation";
import { readSpaceLaunchPreference, writeSpaceLaunchPreference, type SpaceLaunchPreference } from "./spaceLaunchPreferences";
import type { ThreadItem } from "./transcript";
import { horizontalTabStep } from "./tabKeyboardNavigation";
import {
  closeSpaceSessionTab,
  emptySpaceSessionTabs,
  openSpaceSessionTab,
  reconcileProvisionalSessionTab,
  selectSpaceSessionTab,
  tabsForSpace,
} from "./spaceSessionTabs";

function isCommandableAgent(agent: WorkspaceAgent, sessionId: string): boolean {
  return sessionId.length > 0
    && (agent.sessionId === sessionId || agent.id === sessionId || agent.activeSessionId === sessionId);
}

function SessionTabs({ snapshot, spaceLabel, openAgentIds, activeAgentId, navigationOpen, navigationToggleRef, emptyFocusRef, onToggleNavigation, onSelect, onClose }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly spaceLabel: string | undefined;
  readonly openAgentIds: readonly string[];
  readonly activeAgentId: string | undefined;
  readonly navigationOpen: boolean;
  readonly navigationToggleRef: RefObject<HTMLButtonElement | null>;
  readonly emptyFocusRef: RefObject<HTMLElement | null>;
  readonly onToggleNavigation: () => void;
  readonly onSelect: (agentId: string) => void;
  readonly onClose: (agentId: string) => void;
}) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusTab = (agentId: string) => requestAnimationFrame(() => tabRefs.current.get(agentId)?.focus());
  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, agentId: string) => {
    const index = openAgentIds.indexOf(agentId);
    if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const step = horizontalTabStep(event) ?? 0;
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? openAgentIds.length - 1
      : (index + step + openAgentIds.length) % openAgentIds.length;
    const nextId = openAgentIds[nextIndex];
    if (!nextId) return;
    onSelect(nextId);
    focusTab(nextId);
  };
  const closeTab = (agentId: string) => {
    const index = openAgentIds.indexOf(agentId);
    const focusId = agentId === activeAgentId ? openAgentIds[index + 1] ?? openAgentIds[index - 1] : activeAgentId;
    onClose(agentId);
    if (focusId) focusTab(focusId);
    else requestAnimationFrame(() => emptyFocusRef.current?.focus());
  };
  return <div className="focused-titlebar-tabs">
    <button ref={navigationToggleRef} type="button" className="workspace-navigation-toggle" aria-label={navigationOpen ? "Close workspace navigation" : "Open workspace navigation"} aria-controls="workspace-navigation" aria-expanded={navigationOpen} onClick={onToggleNavigation}><Icon name="sidebar" /></button>
    <div className="focused-tabstrip" role="tablist" aria-label={spaceLabel ? `Open sessions in ${spaceLabel}` : "Open sessions"}>
    {openAgentIds.map((agentId) => {
      const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
      const title = agent?.name ?? "Detached session";
      const status = agent ? statusText(agent.status) : "Disconnected";
      return <div key={agentId} role="presentation" className={`focused-tab-shell ${agentId === activeAgentId ? "active" : ""}`}>
        <button
          ref={(element) => { if (element) tabRefs.current.set(agentId, element); else tabRefs.current.delete(agentId); }}
          id={`session-tab-${encodeURIComponent(agentId)}`}
          type="button"
          role="tab"
          aria-controls="selected-session-panel"
          aria-selected={agentId === activeAgentId}
          aria-label={`${title}, ${status}${spaceLabel ? ` in ${spaceLabel}` : ""}. Press Delete to close.`}
          title={title}
          tabIndex={agentId === activeAgentId ? 0 : -1}
          className="focused-tab"
          onClick={() => onSelect(agentId)}
          onKeyDown={(event) => {
            if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); closeTab(agentId); }
            else moveTabFocus(event, agentId);
          }}
        >
          <span className={`focused-status ${agent?.status ?? "disconnected"}`} aria-hidden="true" />
          <span>{title}</span>
        </button>
        <button type="button" tabIndex={-1} aria-label={`Close ${title}`} title={`Close ${title}`} className="focused-tab-close" onClick={() => closeTab(agentId)}><Icon name="close" /></button>
      </div>;
    })}
    </div>
  </div>;
}

function modelKey(model: { readonly provider: string; readonly id: string }): string {
  return JSON.stringify([model.provider, model.id]);
}

function preferenceWithModel(preference: SpaceLaunchPreference, model: AgentModelOption | undefined): SpaceLaunchPreference {
  return model
    ? { modelProvider: model.provider, modelId: model.id, rlmMaxDepth: preference.rlmMaxDepth }
    : { rlmMaxDepth: preference.rlmMaxDepth };
}

function SpaceLaunchpadContainer({ project, worktreeLabel, onRuntimeState, onStarted }: {
  readonly project: WorkspaceProject;
  readonly worktreeLabel: string;
  readonly onRuntimeState: (state: SpaceRuntimeState) => void;
  readonly onStarted: (agentId: string, prompt: string) => void;
}) {
  const [preference, setPreference] = useState(() => readSpaceLaunchPreference(window.localStorage, project.id));
  const initialPreference = useRef(preference).current;
  const [models, setModels] = useState<readonly AgentModelOption[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [retrySequence, setRetrySequence] = useState(0);
  const [promptDraft, setPromptDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setModelsLoading(true);
    setModelsError(null);
    void window.ernie.getSpaceModels(project.id).then(async (available) => {
      if (!active) return;
      if (available.length === 0) {
        setModels([]);
        setModelsError("Models are unavailable. Retry to choose a model and start a thread.");
        return;
      }
      const runtime = await window.ernie.getSpaceState(project.id);
      if (!active) return;
      onRuntimeState(runtime);
      setModels(available);
      const preferred = available.find((model) => model.provider === initialPreference.modelProvider && model.id === initialPreference.modelId);
      const current = available.find((model) => model.provider === runtime.agent.provider && model.id === runtime.agent.modelId);
      const selected = preferred ?? current ?? available[0];
      if (selected) setSelectedModelKey(modelKey(selected));
    }).catch(() => {
      if (active) setModelsError("Models are unavailable. Retry to choose a model and start a thread.");
    }).finally(() => { if (active) setModelsLoading(false); });
    return () => { active = false; };
  }, [initialPreference.modelId, initialPreference.modelProvider, onRuntimeState, project.id, retrySequence]);

  const persist = (next: SpaceLaunchPreference) => {
    setPreference(next);
    writeSpaceLaunchPreference(window.localStorage, project.id, next);
  };
  const selectModel = (key: string) => {
    setSelectedModelKey(key);
    const selected = models.find((model) => modelKey(model) === key);
    if (selected) persist(preferenceWithModel(preference, selected));
  };
  const selectDepth = (rlmMaxDepth: number) => {
    const selected = models.find((model) => modelKey(model) === selectedModelKey);
    persist({ ...preferenceWithModel(preference, selected), rlmMaxDepth });
  };
  const start = async ({ prompt, modelId, rlmMaxDepth }: { readonly prompt: string; readonly modelId: string; readonly rlmMaxDepth: number }) => {
    const selected = models.find((model) => modelKey(model) === modelId);
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.ernie.startSpace({
        spaceId: project.id,
        prompt,
        model: { provider: selected.provider, id: selected.id },
        rlmMaxDepth,
      });
      if (!result.ok) {
        setError(result.error ?? "Prime Agent is unavailable. Review the recovery details, then try again.");
        return;
      }
      persist({ modelProvider: selected.provider, modelId: selected.id, rlmMaxDepth });
      try { onRuntimeState(await window.ernie.getSpaceState(project.id)); } catch { /* A live state event remains authoritative. */ }
      onStarted(`rpc:${project.id}`, prompt);
    } catch {
      setError("Prime Agent is unavailable. Review the recovery details, then try again.");
    } finally {
      setBusy(false);
    }
  };

  return <SpaceLaunchpad
    spaceLabel={project.label}
    worktreeLabel={worktreeLabel}
    models={models.map((model) => ({ id: modelKey(model), label: model.label, provider: model.provider }))}
    selectedModelId={selectedModelKey}
    modelsLoading={modelsLoading}
    modelsError={modelsError}
    onModelChange={selectModel}
    onRetryModels={() => setRetrySequence((sequence) => sequence + 1)}
    rlmMaxDepth={preference.rlmMaxDepth}
    onRlmMaxDepthChange={selectDepth}
    promptDraft={promptDraft}
    onPromptDraftChange={setPromptDraft}
    busy={busy}
    error={error}
    onSubmit={(payload) => { void start(payload); }}
  />;
}

function SessionSurface({ snapshot, agentId, loading, activeProject, runtimeState, liveItems, onAppendLiveUser, onRuntimeState, onStarted, onShowAgentHierarchy }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly agentId: string | undefined;
  readonly loading: boolean;
  readonly activeProject: WorkspaceProject | undefined;
  readonly runtimeState: SpaceRuntimeState | undefined;
  readonly liveItems: readonly ThreadItem[];
  readonly onAppendLiveUser: (spaceId: string, text: string, steered: boolean) => void;
  readonly onRuntimeState: (state: SpaceRuntimeState) => void;
  readonly onStarted: (agentId: string, prompt: string) => void;
  readonly onShowAgentHierarchy: (agentId: string) => void;
}) {
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  if (loading) return <section className="focused-surface empty"><div><h1>Loading workspace…</h1><p>Finding your spaces and Prime Agent sessions.</p></div></section>;
  if (agentId === undefined && activeProject) {
    const worktreeIds = new Set(activeProject.worktreeIds);
    const worktree = snapshot.worktrees.find((candidate) => worktreeIds.has(candidate.id));
    return <SpaceLaunchpadContainer
      key={activeProject.id}
      project={activeProject}
      worktreeLabel={worktree?.label ?? "Local directory"}
      onRuntimeState={onRuntimeState}
      onStarted={onStarted}
    />;
  }
  if (agentId === undefined) return <section className="focused-surface empty"><div><h1>No spaces yet</h1><p>Open a folder to add your first space.</p></div></section>;
  if (!agent) return <section className="focused-surface empty"><div><h1>Session no longer available</h1><p>Ernie can’t find this session in its space. Closing this tab won’t delete saved work.</p></div></section>;
  const project = projectForAgent(snapshot, agent);
  const assistantSubagentCount = countEngagedAgentDescendants(snapshot.agents, agent.id);
  const state = runtimeState?.agent;
  if (agent.id.startsWith("rpc:") && state) return <LiveSessionChatSurface agent={agent} state={state} items={liveItems} onAppendUser={(text, steered) => onAppendLiveUser(project?.id ?? activeProject?.id ?? "", text, steered)} spaceId={project?.id ?? activeProject?.id ?? ""} assistantSubagentCount={assistantSubagentCount} onShowAssistantHierarchy={() => onShowAgentHierarchy(agent.id)} />;
  const interactive = state !== undefined && isCommandableAgent(agent, state.sessionId);
  return <SessionChatSurface agent={agent} state={state} interactive={interactive} spaceId={project?.id} assistantSubagentCount={assistantSubagentCount} onShowAssistantHierarchy={() => onShowAgentHierarchy(agent.id)} />;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function FocusedWorkspace({ snapshot, runtimeStates, liveItemsBySpace, onAppendLiveUser, onRuntimeState, failed, loading, onSnapshot }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly runtimeStates: ReadonlyMap<string, SpaceRuntimeState>;
  readonly liveItemsBySpace: ReadonlyMap<string, readonly ThreadItem[]>;
  readonly onAppendLiveUser: (spaceId: string, text: string, steered: boolean) => void;
  readonly onRuntimeState: (state: SpaceRuntimeState) => void;
  readonly failed: boolean;
  readonly loading: boolean;
  readonly onSnapshot: (snapshot: WorkspaceSnapshot) => void;
}) {
  const { workspace, currentAgentBySpace } = useMemo(() => {
    const current = new Map<string, string>();
    const liveAgents: WorkspaceAgent[] = [];
    for (const project of snapshot.projects) {
      const runtime = runtimeStates.get(project.id);
      if (!runtime) continue;
      const catalogAgent = snapshot.agents.find((agent) => project.worktreeIds.includes(agent.worktreeId) && isCommandableAgent(agent, runtime.agent.sessionId));
      if (catalogAgent) {
        current.set(project.id, catalogAgent.id);
        continue;
      }
      if (runtime.agent.messageCount === 0 && !runtime.agent.isStreaming) continue;
      const worktreeId = project.worktreeIds[0];
      if (!worktreeId) continue;
      const liveAgent: WorkspaceAgent = {
        id: `rpc:${project.id}`,
        sessionId: runtime.agent.sessionId,
        worktreeId,
        name: runtime.agent.sessionName || "New conversation",
        summary: runtime.agent.detail,
        status: runtime.agent.isStreaming ? "working" : runtime.agent.connection === "ready" ? "idle" : runtime.agent.connection === "failed" ? "failed" : "waiting",
        runtimeKind: "root",
      };
      liveAgents.push(liveAgent);
      current.set(project.id, liveAgent.id);
    }
    return {
      workspace: liveAgents.length > 0 ? { ...snapshot, agents: [...liveAgents, ...snapshot.agents] } : snapshot,
      currentAgentBySpace: current,
    };
  }, [runtimeStates, snapshot]);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(snapshot.projects[0]?.id);
  const [spaceTabs, setSpaceTabs] = useState(emptySpaceSessionTabs);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | undefined>();
  const compactNavigation = useMediaQuery("(max-width: 700px)");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [agentRevealRequest, setAgentRevealRequest] = useState<{ readonly agentId: string; readonly requestId: number }>();
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  const emptySessionFocusRef = useRef<HTMLElement>(null);
  const initialized = useRef(false);
  const closeNavigation = () => setNavigationOpen(false);
  const activeSpaceTabs = tabsForSpace(spaceTabs, activeProjectId);
  const openAgentIds = activeSpaceTabs.agentIds;
  const activeAgentId = activeSpaceTabs.activeAgentId;

  useEffect(() => { if (!compactNavigation) setNavigationOpen(false); }, [compactNavigation]);
  useLayoutEffect(() => {
    if (!compactNavigation || navigationOpen) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest("#workspace-navigation")) navigationToggleRef.current?.focus();
  }, [compactNavigation, navigationOpen]);
  useEffect(() => {
    if (!compactNavigation || !navigationOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") closeNavigation(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [compactNavigation, navigationOpen]);

  useEffect(() => {
    if (initialized.current || workspace.agents.length === 0) return;
    initialized.current = true;
    const currentIds = new Set(currentAgentBySpace.values());
    const initial = workspace.agents.find((agent) => currentIds.has(agent.id))
      ?? workspace.agents.find((agent) => agent.status === "working")
      ?? workspace.agents[0];
    if (!initial) return;
    const projectId = projectForAgent(workspace, initial)?.id;
    if (!projectId) return;
    setSpaceTabs((state) => openSpaceSessionTab(state, projectId, initial.id));
    setActiveProjectId(projectId);
  }, [currentAgentBySpace, workspace]);

  useEffect(() => {
    setSpaceTabs((state) => {
      let next = state;
      for (const [spaceId, agentId] of currentAgentBySpace) {
        if (!agentId.startsWith("rpc:")) next = reconcileProvisionalSessionTab(next, spaceId, agentId);
      }
      return next;
    });
  }, [currentAgentBySpace]);

  useEffect(() => {
    if (activeProjectId !== undefined && snapshot.projects.some((project) => project.id === activeProjectId)) return;
    setActiveProjectId(snapshot.projects[0]?.id);
  }, [activeProjectId, snapshot.projects]);
  useEffect(() => {
    if (!activeProjectId || runtimeStates.has(activeProjectId)) return;
    let active = true;
    void window.ernie.getSpaceState(activeProjectId).then((state) => { if (active) onRuntimeState(state); }).catch(() => {});
    return () => { active = false; };
  }, [activeProjectId, onRuntimeState, runtimeStates]);

  const activeProject = workspace.projects.find((project) => project.id === activeProjectId);
  const runtimeState = activeProjectId ? runtimeStates.get(activeProjectId) : undefined;
  const liveItems = activeProjectId ? liveItemsBySpace.get(activeProjectId) ?? [] : [];
  const selectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    if (compactNavigation) closeNavigation();
  };
  const openAgent = (agent: WorkspaceAgent) => {
    const projectId = projectForAgent(workspace, agent)?.id;
    if (!projectId) return;
    setSpaceTabs((state) => openSpaceSessionTab(state, projectId, agent.id));
    setActiveProjectId(projectId);
    if (compactNavigation) closeNavigation();
  };
  const selectAgent = (agentId: string) => {
    if (!activeProjectId) return;
    setSpaceTabs((state) => selectSpaceSessionTab(state, activeProjectId, agentId));
  };
  const closeAgent = (agentId: string) => {
    if (!activeProjectId) return;
    setSpaceTabs((state) => closeSpaceSessionTab(state, activeProjectId, agentId));
  };
  const started = (agentId: string, prompt: string) => {
    if (!activeProjectId) return;
    setSpaceTabs((state) => openSpaceSessionTab(state, activeProjectId, agentId));
    onAppendLiveUser(activeProjectId, prompt, false);
  };
  const showAgentHierarchy = (agentId: string) => {
    setAgentRevealRequest((current) => ({ agentId, requestId: (current?.requestId ?? 0) + 1 }));
    if (compactNavigation) setNavigationOpen(true);
  };
  const openDirectory = async () => {
    setOpening(true); setOpenError(undefined);
    try {
      const result = await window.ernie.openProjectDirectory();
      if (!result.ok) { setOpenError(result.error); return; }
      if (!result.cancelled) { onSnapshot(result.snapshot); setActiveProjectId(result.snapshot.projects.at(-1)?.id); }
    } finally { setOpening(false); }
  };

  return <div className="focused-workspace">
    <WorkspaceSidebar snapshot={workspace} activeProjectId={activeProjectId} activeAgentId={activeAgentId} loading={loading} failed={failed} opening={opening} openError={openError} compact={compactNavigation} open={!compactNavigation || navigationOpen} revealAgent={agentRevealRequest} onClose={closeNavigation} onSelectProject={selectProject} onOpenAgent={openAgent} onOpenDirectory={() => { void openDirectory(); }} />
    {compactNavigation && navigationOpen && <button type="button" tabIndex={-1} aria-hidden="true" className="workspace-navigation-scrim" onClick={closeNavigation} />}
    <section className="focused-main-column" aria-hidden={compactNavigation && navigationOpen} inert={compactNavigation && navigationOpen ? true : undefined}>
      <div className="focused-titlebar-drag" aria-hidden="true" />
      <SessionTabs snapshot={workspace} spaceLabel={activeProject?.label} openAgentIds={openAgentIds} activeAgentId={activeAgentId} navigationOpen={navigationOpen} navigationToggleRef={navigationToggleRef} emptyFocusRef={emptySessionFocusRef} onToggleNavigation={() => setNavigationOpen((current) => !current)} onSelect={selectAgent} onClose={closeAgent} />
      <section ref={emptySessionFocusRef} tabIndex={-1} id="selected-session-panel" className="selected-session-panel" role="tabpanel" aria-labelledby={activeAgentId ? `session-tab-${encodeURIComponent(activeAgentId)}` : undefined} aria-label={activeAgentId ? undefined : "Session workspace"}>
        <SessionSurface snapshot={workspace} agentId={activeAgentId} loading={loading} activeProject={activeProject} runtimeState={runtimeState} liveItems={liveItems} onAppendLiveUser={onAppendLiveUser} onRuntimeState={onRuntimeState} onStarted={started} onShowAgentHierarchy={showAgentHierarchy} />
      </section>
    </section>
  </div>;
}
