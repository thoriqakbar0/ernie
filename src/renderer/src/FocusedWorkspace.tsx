import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import type { AgentState } from "../../shared/contract";
import type { AgentModelOption, AgentThinkingLevel, SpaceRuntimeState } from "../../shared/spaceRuntime";
import type { WorkspaceAgent, WorkspaceProject, WorkspaceSnapshot, WorkspaceWorktree } from "../../shared/workspace";
import { LiveSessionChatSurface, SessionChatSurface } from "./SessionChatSurface";
import { SpaceLaunchpad } from "./SpaceLaunchpad";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { PerformanceHud, PerformanceProfiler } from "./PerformanceHud";
import { Icon } from "./WorkspaceIcon";
import { summarizeAgentDescendantActivity, projectForAgent, statusText } from "./workspaceAgentPresentation";
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

function SessionTabs({ snapshot, locationLabel, openAgentIds, activeAgentId, navigationOpen, showNavigationToggle, navigationToggleRef, emptyFocusRef, onToggleNavigation, onSelect, onClose }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly locationLabel: string | undefined;
  readonly openAgentIds: readonly string[];
  readonly activeAgentId: string | undefined;
  readonly navigationOpen: boolean;
  readonly showNavigationToggle: boolean;
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
    {showNavigationToggle && <button ref={navigationToggleRef} type="button" className="workspace-navigation-toggle" aria-label="Open workspace navigation" aria-controls="workspace-navigation" aria-expanded={navigationOpen} onClick={onToggleNavigation}><Icon name="sidebar" /></button>}
    <div className="focused-tabstrip" role="tablist" aria-label={locationLabel ? `Open sessions in ${locationLabel}` : "Open sessions"}>
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
          aria-label={`${title}, ${status}${locationLabel ? ` in ${locationLabel}` : ""}. Press Delete to close.`}
          title={title}
          tabIndex={agentId === activeAgentId ? 0 : -1}
          className="focused-tab"
          onClick={() => onSelect(agentId)}
          onKeyDown={(event) => {
            if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); closeTab(agentId); }
            else moveTabFocus(event, agentId);
          }}
        ><span>{title}</span></button>
        <span className={`focused-tab-status ${agent?.status ?? "disconnected"}`} aria-hidden="true" />
        <button type="button" tabIndex={-1} aria-label={`Close ${title}`} title={`Close ${title}`} className="focused-tab-close" onClick={() => closeTab(agentId)}><Icon name="close" /></button>
      </div>;
    })}
    </div>
  </div>;
}

function modelKey(model: { readonly provider: string; readonly id: string }): string {
  return JSON.stringify([model.provider, model.id]);
}

function preferredThinkingLevel(model: AgentModelOption, requested: AgentThinkingLevel): AgentThinkingLevel {
  if (model.thinkingLevels.includes(requested)) return requested;
  if (model.thinkingLevels.includes("low")) return "low";
  return model.thinkingLevels[0] ?? "off";
}

function SpaceLaunchpadContainer({ runtimeId, project, projects, worktreeLabel, openingDirectory, openDirectoryError, promptDraft, onPromptDraftChange, onSelectProject, onOpenDirectory, onRuntimeState, onStarted }: {
  readonly runtimeId: string;
  readonly project: WorkspaceProject;
  readonly projects: readonly WorkspaceProject[];
  readonly worktreeLabel: string;
  readonly openingDirectory: boolean;
  readonly openDirectoryError: string | undefined;
  readonly promptDraft: string;
  readonly onPromptDraftChange: (prompt: string) => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly onOpenDirectory: () => void;
  readonly onRuntimeState: (state: SpaceRuntimeState) => void;
  readonly onStarted: (agentId: string, prompt: string) => void;
}) {
  const [preference, setPreference] = useState(() => readSpaceLaunchPreference(window.localStorage, runtimeId));
  const initialPreference = useRef(preference).current;
  const [models, setModels] = useState<readonly AgentModelOption[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [selectedThinkingLevel, setSelectedThinkingLevel] = useState<AgentThinkingLevel>(initialPreference.thinkingLevel);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [retrySequence, setRetrySequence] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setModelsLoading(true);
    setModelsError(null);
    void window.ernie.getSpaceModels(runtimeId).then(async (available) => {
      if (!active) return;
      if (available.length === 0) {
        setModels([]);
        setModelsError("Models are unavailable. Retry to choose a model and start a thread.");
        return;
      }
      const runtime = await window.ernie.getSpaceState(runtimeId);
      if (!active) return;
      onRuntimeState(runtime);
      setModels(available);
      const preferred = available.find((model) => model.provider === initialPreference.modelProvider && model.id === initialPreference.modelId);
      const current = available.find((model) => model.provider === runtime.agent.provider && model.id === runtime.agent.modelId);
      const selected = preferred ?? current ?? available[0];
      if (selected) {
        setSelectedModelKey(modelKey(selected));
        setSelectedThinkingLevel(preferredThinkingLevel(selected, initialPreference.thinkingLevel));
      }
    }).catch(() => {
      if (active) setModelsError("Models are unavailable. Retry to choose a model and start a thread.");
    }).finally(() => { if (active) setModelsLoading(false); });
    return () => { active = false; };
  }, [initialPreference.modelId, initialPreference.modelProvider, initialPreference.thinkingLevel, onRuntimeState, retrySequence, runtimeId]);

  const persist = (next: SpaceLaunchPreference) => {
    setPreference(next);
    writeSpaceLaunchPreference(window.localStorage, runtimeId, next);
  };
  const selectModel = (key: string) => {
    setSelectedModelKey(key);
    const selected = models.find((model) => modelKey(model) === key);
    if (!selected) return;
    const thinkingLevel = preferredThinkingLevel(selected, selectedThinkingLevel);
    setSelectedThinkingLevel(thinkingLevel);
    persist({ modelProvider: selected.provider, modelId: selected.id, thinkingLevel, rlmMaxDepth: preference.rlmMaxDepth });
  };
  const selectThinkingLevel = (thinkingLevel: AgentThinkingLevel) => {
    setSelectedThinkingLevel(thinkingLevel);
    const selected = models.find((model) => modelKey(model) === selectedModelKey);
    persist({ ...(selected ? { modelProvider: selected.provider, modelId: selected.id } : {}), thinkingLevel, rlmMaxDepth: preference.rlmMaxDepth });
  };
  const selectDepth = (rlmMaxDepth: number) => {
    const selected = models.find((model) => modelKey(model) === selectedModelKey);
    persist({ ...(selected ? { modelProvider: selected.provider, modelId: selected.id } : {}), thinkingLevel: selectedThinkingLevel, rlmMaxDepth });
  };
  const start = async ({ prompt, modelId, thinkingLevel, rlmMaxDepth }: { readonly prompt: string; readonly modelId: string; readonly thinkingLevel: AgentThinkingLevel; readonly rlmMaxDepth: number }) => {
    const selected = models.find((model) => modelKey(model) === modelId);
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.ernie.startSpace({
        spaceId: runtimeId,
        prompt,
        model: { provider: selected.provider, id: selected.id },
        thinkingLevel,
        rlmMaxDepth,
      });
      if (!result.ok) {
        setError(result.error ?? "Prime Agent is unavailable. Review the recovery details, then try again.");
        return;
      }
      persist({ modelProvider: selected.provider, modelId: selected.id, thinkingLevel, rlmMaxDepth });
      try { onRuntimeState(await window.ernie.getSpaceState(runtimeId)); } catch { /* A live state event remains authoritative. */ }
      onPromptDraftChange("");
      onStarted(`rpc:${runtimeId}`, prompt);
    } catch {
      setError("Prime Agent is unavailable. Review the recovery details, then try again.");
    } finally {
      setBusy(false);
    }
  };

  return <SpaceLaunchpad
    spaceId={project.id}
    spaceLabel={project.label}
    worktreeLabel={worktreeLabel}
    projects={projects.map(({ id, label, path }) => ({ id, label, path }))}
    onSelectProject={onSelectProject}
    onOpenDirectory={onOpenDirectory}
    openingDirectory={openingDirectory}
    openDirectoryError={openDirectoryError}
    models={models.map((model) => ({ id: modelKey(model), label: model.label, provider: model.provider, thinkingLevels: model.thinkingLevels }))}
    selectedModelId={selectedModelKey}
    modelsLoading={modelsLoading}
    modelsError={modelsError}
    onModelChange={selectModel}
    selectedThinkingLevel={selectedThinkingLevel}
    onThinkingLevelChange={selectThinkingLevel}
    rlmMaxDepth={preference.rlmMaxDepth}
    onRlmMaxDepthChange={selectDepth}
    onRetryModels={() => setRetrySequence((sequence) => sequence + 1)}
    promptDraft={promptDraft}
    onPromptDraftChange={onPromptDraftChange}
    busy={busy}
    error={error}
    onSubmit={(payload) => { void start(payload); }}
  />;
}

export function SessionSurface({ snapshot, agentId, loading, activeProject, activeWorktree, runtimeState, liveItems, opening, openError, spacePromptDraft, onSpacePromptDraftChange, onAppendLiveUser, onRuntimeState, onStarted, onShowAgentHierarchy, onSelectProject, onOpenDirectory }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly agentId: string | undefined;
  readonly loading: boolean;
  readonly activeProject: WorkspaceProject | undefined;
  readonly activeWorktree: WorkspaceWorktree | undefined;
  readonly runtimeState: SpaceRuntimeState | undefined;
  readonly liveItems: readonly ThreadItem[];
  readonly opening: boolean;
  readonly openError: string | undefined;
  readonly spacePromptDraft: string;
  readonly onSpacePromptDraftChange: (prompt: string) => void;
  readonly onAppendLiveUser: (spaceId: string, text: string, steered: boolean) => void;
  readonly onRuntimeState: (state: SpaceRuntimeState) => void;
  readonly onStarted: (agentId: string, prompt: string) => void;
  readonly onShowAgentHierarchy: (agentId: string) => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly onOpenDirectory: () => void;
}) {
  const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
  if (loading) return <section className="focused-surface empty"><div><h1>Loading workspace…</h1><p>Finding your spaces and Prime Agent sessions.</p></div></section>;
  if (agentId === undefined && activeProject && activeWorktree) {
    return <SpaceLaunchpadContainer
      key={activeWorktree.id}
      runtimeId={activeWorktree.id}
      project={activeProject}
      projects={snapshot.projects}
      worktreeLabel={activeWorktree.label}
      openingDirectory={opening}
      openDirectoryError={openError}
      promptDraft={spacePromptDraft}
      onPromptDraftChange={onSpacePromptDraftChange}
      onSelectProject={onSelectProject}
      onOpenDirectory={onOpenDirectory}
      onRuntimeState={onRuntimeState}
      onStarted={onStarted}
    />;
  }
  if (agentId === undefined) return <section className="focused-surface empty">
    <div className="focused-empty-hero">
      <header>
        <h1>What should we work on?</h1>
        <p>Open a folder to add your first space.</p>
        <button type="button" disabled={opening} onClick={onOpenDirectory}><Icon name="folder-add" /><span>{opening ? "Opening folder…" : "Open folder"}</span></button>
        {openError && <p className="focused-empty-error" role="alert">{openError}</p>}
      </header>
    </div>
  </section>;
  if (!agent) return <section className="focused-surface empty"><div><h1>Session no longer available</h1><p>Ernie can’t find this session in its space. Closing this tab won’t delete saved work.</p></div></section>;
  const assistantSubagents = summarizeAgentDescendantActivity(snapshot.agents, agent.id);
  const assistantSubagentCount = assistantSubagents.working;
  const assistantRunningSubagentCount = assistantSubagents.working;
  const state = runtimeState?.agent;
  if (agent.id.startsWith("rpc:") && state) return <LiveSessionChatSurface agent={agent} state={state} items={liveItems} onAppendUser={(text, steered) => onAppendLiveUser(agent.worktreeId, text, steered)} spaceId={agent.worktreeId} assistantSubagentCount={assistantSubagentCount} assistantRunningSubagentCount={assistantRunningSubagentCount} onShowAssistantHierarchy={() => onShowAgentHierarchy(agent.id)} />;
  const interactive = state !== undefined && isCommandableAgent(agent, state.sessionId);
  return <SessionChatSurface agent={agent} state={state} interactive={interactive} spaceId={agent.worktreeId} assistantSubagentCount={assistantSubagentCount} assistantRunningSubagentCount={assistantRunningSubagentCount} onShowAssistantHierarchy={() => onShowAgentHierarchy(agent.id)} />;
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
  const { workspace, currentAgentByWorktree } = useMemo(() => {
    const current = new Map<string, string>();
    const liveAgents: WorkspaceAgent[] = [];
    for (const project of snapshot.projects) {
      const worktreeIds = project.worktreeIds.length > 0 ? project.worktreeIds : [project.id];
      for (const worktreeId of worktreeIds) {
        const runtime = runtimeStates.get(worktreeId);
        if (!runtime) continue;
        const catalogAgent = snapshot.agents.find((agent) => agent.worktreeId === worktreeId && isCommandableAgent(agent, runtime.agent.sessionId));
        if (catalogAgent) {
          current.set(worktreeId, catalogAgent.id);
          continue;
        }
        if (runtime.agent.messageCount === 0 && !runtime.agent.isStreaming) continue;
        const liveAgent: WorkspaceAgent = {
          id: `rpc:${worktreeId}`,
          sessionId: runtime.agent.sessionId,
          worktreeId,
          name: runtime.agent.sessionName || "New conversation",
          summary: runtime.agent.detail,
          status: runtime.agent.isStreaming ? "working" : runtime.agent.connection === "ready" ? "idle" : runtime.agent.connection === "failed" ? "failed" : "waiting",
          runtimeKind: "root",
        };
        liveAgents.push(liveAgent);
        current.set(worktreeId, liveAgent.id);
      }
    }
    return {
      workspace: liveAgents.length > 0 ? { ...snapshot, agents: [...liveAgents, ...snapshot.agents] } : snapshot,
      currentAgentByWorktree: current,
    };
  }, [runtimeStates, snapshot]);

  const rootWorktreeFor = (project: WorkspaceProject | undefined): WorkspaceWorktree | undefined => {
    if (!project) return undefined;
    const rootId = project.worktreeIds.find((id) => id === project.id) ?? project.worktreeIds[0] ?? project.id;
    return workspace.worktrees.find((worktree) => worktree.id === rootId)
      ?? { id: project.id, path: project.path, label: "Local directory" };
  };
  const initialProject = snapshot.projects[0];
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(initialProject?.id);
  const [activeWorktreeId, setActiveWorktreeId] = useState<string | undefined>(() => {
    if (!initialProject) return undefined;
    return initialProject.worktreeIds.find((id) => id === initialProject.id) ?? initialProject.worktreeIds[0] ?? initialProject.id;
  });
  const [spacePromptDrafts, setSpacePromptDrafts] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [spaceTabs, setSpaceTabs] = useState(emptySpaceSessionTabs);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | undefined>();
  const compactNavigation = useMediaQuery("(max-width: 700px)");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [performanceEnabled, setPerformanceEnabled] = useState(false);
  const [agentRevealRequest, setAgentRevealRequest] = useState<{ readonly agentId: string; readonly requestId: number }>();
  const navigationToggleRef = useRef<HTMLButtonElement>(null);
  const emptySessionFocusRef = useRef<HTMLElement>(null);
  const initialized = useRef(false);
  const sidebarOpen = compactNavigation ? navigationOpen : desktopSidebarOpen;
  const closeNavigation = () => {
    if (compactNavigation) setNavigationOpen(false);
    else setDesktopSidebarOpen(false);
    requestAnimationFrame(() => requestAnimationFrame(() => navigationToggleRef.current?.focus()));
  };
  const openNavigation = () => {
    if (compactNavigation) setNavigationOpen(true);
    else setDesktopSidebarOpen(true);
  };
  const activeSpaceTabs = tabsForSpace(spaceTabs, activeWorktreeId);
  const openAgentIds = activeSpaceTabs.agentIds;
  const activeAgentId = activeSpaceTabs.activeAgentId;

  useEffect(() => {
    if (compactNavigation) setPerformanceEnabled(false);
    else setNavigationOpen(false);
  }, [compactNavigation]);
  useLayoutEffect(() => {
    if (sidebarOpen) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest("#workspace-navigation")) navigationToggleRef.current?.focus();
  }, [sidebarOpen]);
  useEffect(() => {
    if (!compactNavigation || !navigationOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") closeNavigation(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [compactNavigation, navigationOpen]);

  useEffect(() => {
    if (initialized.current || workspace.agents.length === 0) return;
    initialized.current = true;
    const currentIds = new Set(currentAgentByWorktree.values());
    const initial = workspace.agents.find((agent) => currentIds.has(agent.id))
      ?? workspace.agents.find((agent) => agent.status === "working")
      ?? workspace.agents[0];
    if (!initial) return;
    const projectId = projectForAgent(workspace, initial)?.id;
    if (!projectId) return;
    setSpaceTabs((state) => openSpaceSessionTab(state, initial.worktreeId, initial.id));
    setActiveProjectId(projectId);
    setActiveWorktreeId(initial.worktreeId);
  }, [currentAgentByWorktree, workspace]);

  useEffect(() => {
    setSpaceTabs((state) => {
      let next = state;
      for (const [worktreeId, agentId] of currentAgentByWorktree) {
        if (!agentId.startsWith("rpc:")) next = reconcileProvisionalSessionTab(next, worktreeId, agentId);
      }
      return next;
    });
  }, [currentAgentByWorktree]);

  useEffect(() => {
    const project = snapshot.projects.find((candidate) => candidate.id === activeProjectId) ?? snapshot.projects[0];
    if (!project) {
      setActiveProjectId(undefined);
      setActiveWorktreeId(undefined);
      return;
    }
    const validIds = new Set(project.worktreeIds.length > 0 ? project.worktreeIds : [project.id]);
    if (project.id !== activeProjectId) setActiveProjectId(project.id);
    if (!activeWorktreeId || !validIds.has(activeWorktreeId)) {
      setActiveWorktreeId(project.worktreeIds.find((id) => id === project.id) ?? project.worktreeIds[0] ?? project.id);
    }
  }, [activeProjectId, activeWorktreeId, snapshot.projects]);
  useEffect(() => {
    if (!activeWorktreeId || runtimeStates.has(activeWorktreeId)) return;
    let active = true;
    void window.ernie.getSpaceState(activeWorktreeId).then((state) => { if (active) onRuntimeState(state); }).catch(() => {});
    return () => { active = false; };
  }, [activeWorktreeId, onRuntimeState, runtimeStates]);

  const activeProject = workspace.projects.find((project) => project.id === activeProjectId);
  const activeWorktree = workspace.worktrees.find((worktree) => worktree.id === activeWorktreeId) ?? rootWorktreeFor(activeProject);
  const activeSpacePromptDraft = activeWorktreeId ? spacePromptDrafts.get(activeWorktreeId) ?? "" : "";
  const setActiveSpacePromptDraft = (prompt: string) => {
    if (!activeWorktreeId) return;
    setSpacePromptDrafts((current) => {
      const next = new Map(current);
      if (prompt === "") next.delete(activeWorktreeId);
      else next.set(activeWorktreeId, prompt);
      return next;
    });
  };
  const runtimeState = activeWorktreeId ? runtimeStates.get(activeWorktreeId) : undefined;
  const liveItems = activeWorktreeId ? liveItemsBySpace.get(activeWorktreeId) ?? [] : [];
  const selectProject = (projectId: string) => {
    const project = workspace.projects.find((candidate) => candidate.id === projectId);
    setActiveProjectId(projectId);
    setActiveWorktreeId(rootWorktreeFor(project)?.id ?? projectId);
    if (compactNavigation) closeNavigation();
  };
  const selectWorktree = (projectId: string, worktreeId: string) => {
    setActiveProjectId(projectId);
    setActiveWorktreeId(worktreeId);
    if (compactNavigation) closeNavigation();
  };
  const openAgent = (agent: WorkspaceAgent) => {
    const projectId = projectForAgent(workspace, agent)?.id;
    if (!projectId) return;
    setSpaceTabs((state) => openSpaceSessionTab(state, agent.worktreeId, agent.id));
    setActiveProjectId(projectId);
    setActiveWorktreeId(agent.worktreeId);
    if (compactNavigation) closeNavigation();
  };
  const selectAgent = (agentId: string) => {
    if (!activeWorktreeId) return;
    setSpaceTabs((state) => selectSpaceSessionTab(state, activeWorktreeId, agentId));
  };
  const closeAgent = (agentId: string) => {
    if (!activeWorktreeId) return;
    setSpaceTabs((state) => closeSpaceSessionTab(state, activeWorktreeId, agentId));
  };
  const started = (agentId: string, prompt: string) => {
    if (!activeWorktreeId) return;
    setSpaceTabs((state) => openSpaceSessionTab(state, activeWorktreeId, agentId));
    onAppendLiveUser(activeWorktreeId, prompt, false);
  };
  const showAgentHierarchy = (agentId: string) => {
    setAgentRevealRequest((current) => ({ agentId, requestId: (current?.requestId ?? 0) + 1 }));
    openNavigation();
  };
  const openDirectory = async () => {
    setOpening(true); setOpenError(undefined);
    try {
      const result = await window.ernie.openProjectDirectory();
      if (!result.ok) { setOpenError(result.error); return; }
      if (!result.cancelled) {
        onSnapshot(result.snapshot);
        const project = result.snapshot.projects.at(-1);
        setActiveProjectId(project?.id);
        setActiveWorktreeId(project?.worktreeIds.find((id) => id === project.id) ?? project?.worktreeIds[0] ?? project?.id);
      }
    } finally { setOpening(false); }
  };
  const locationLabel = activeProject && activeWorktree
    ? activeWorktree.id === (rootWorktreeFor(activeProject)?.id) ? activeProject.label : `${activeProject.label} · ${activeWorktree.label}`
    : activeProject?.label;

  return <PerformanceHud enabled={import.meta.env.DEV && performanceEnabled}>
    <div className={`focused-workspace ${sidebarOpen ? "" : "sidebar-collapsed"}`}>
      <PerformanceProfiler area="sidebar">
        <WorkspaceSidebar snapshot={workspace} activeProjectId={activeProjectId} activeWorktreeId={activeWorktreeId} activeAgentId={activeAgentId} loading={loading} failed={failed} opening={opening} openError={openError} compact={compactNavigation} open={sidebarOpen} revealAgent={agentRevealRequest} performanceEnabled={performanceEnabled} onTogglePerformance={() => setPerformanceEnabled((current) => !current)} onClose={closeNavigation} onSelectProject={selectProject} onSelectWorktree={selectWorktree} onOpenAgent={openAgent} onOpenDirectory={() => { void openDirectory(); }} />
      </PerformanceProfiler>
      {compactNavigation && navigationOpen && <button type="button" tabIndex={-1} aria-hidden="true" className="workspace-navigation-scrim" onClick={closeNavigation} />}
      <PerformanceProfiler area="main">
        <section className="focused-main-column" aria-hidden={compactNavigation && navigationOpen} inert={compactNavigation && navigationOpen ? true : undefined}>
          <div className="focused-titlebar-drag" aria-hidden="true" />
          <SessionTabs snapshot={workspace} locationLabel={locationLabel} openAgentIds={openAgentIds} activeAgentId={activeAgentId} navigationOpen={sidebarOpen} showNavigationToggle={!sidebarOpen} navigationToggleRef={navigationToggleRef} emptyFocusRef={emptySessionFocusRef} onToggleNavigation={openNavigation} onSelect={selectAgent} onClose={closeAgent} />
          <section ref={emptySessionFocusRef} tabIndex={-1} id="selected-session-panel" className="selected-session-panel" role="tabpanel" aria-labelledby={activeAgentId ? `session-tab-${encodeURIComponent(activeAgentId)}` : undefined} aria-label={activeAgentId ? undefined : "Session workspace"}>
            <SessionSurface snapshot={workspace} agentId={activeAgentId} loading={loading} activeProject={activeProject} activeWorktree={activeWorktree} runtimeState={runtimeState} liveItems={liveItems} opening={opening} openError={openError} spacePromptDraft={activeSpacePromptDraft} onSpacePromptDraftChange={setActiveSpacePromptDraft} onAppendLiveUser={onAppendLiveUser} onRuntimeState={onRuntimeState} onStarted={started} onShowAgentHierarchy={showAgentHierarchy} onSelectProject={selectProject} onOpenDirectory={() => { void openDirectory(); }} />
          </section>
        </section>
      </PerformanceProfiler>
    </div>
  </PerformanceHud>;
}
