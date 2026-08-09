import { useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { WorkspaceAgent, WorkspaceProject, WorkspaceSnapshot, WorkspaceWorktree } from "../../../shared/workspace";
import { prioritizeRootAgents } from "../agentPriority";
import { Icon } from "../WorkspaceIcon";
import { projectForAgent, statusText } from "../workspaceAgentPresentation";
import { AgentViewTabs, GroupedAgentPane, PriorityAgentPane } from "./agent-panes";
import type { AgentView } from "./agent-panes";
import { agentIdsWithAncestors, matchesSearch } from "./filter-workspace";
import { FirstSpaceEmptyState, SettledWorktreeRow, SpaceRow } from "./space-rows";
import type { SettledWorktree, SettledWorktreeEntry } from "./space-rows";

function trapDrawerFocus(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Tab") return;
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled):not([tabindex='-1']),[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex='-1'])")];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/** Workspace navigation composed from space and agent panes. */
export function WorkspaceSidebar({ snapshot, activeProjectId, activeWorktreeId, activeAgentId, loading, failed, opening, archivingProjectId, openError, worktreeBusyOwner, worktreeError, compact, open, revealAgent, performanceEnabled, onTogglePerformance, onClose, onSelectProject, onSelectWorktree, onArchiveProject, onCreateWorktree, onArchiveWorktree, onRestoreWorktree, onRemoveWorktree, onOpenAgent, onOpenDirectory }: {
  readonly snapshot: WorkspaceSnapshot;
  readonly activeProjectId: string | undefined;
  readonly activeWorktreeId: string | undefined;
  readonly activeAgentId: string | undefined;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly opening: boolean;
  readonly archivingProjectId: string | undefined;
  readonly openError: string | undefined;
  readonly worktreeBusyOwner: string | undefined;
  readonly worktreeError: string | undefined;
  readonly compact: boolean;
  readonly open: boolean;
  readonly revealAgent: { readonly agentId: string; readonly requestId: number } | undefined;
  readonly performanceEnabled: boolean;
  readonly onTogglePerformance: () => void;
  readonly onClose: () => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly onSelectWorktree: (projectId: string, worktreeId: string) => void;
  readonly onArchiveProject: (project: WorkspaceProject) => void;
  readonly onCreateWorktree: (projectId: string, sourceWorktreeId: string, branch: string) => void;
  readonly onArchiveWorktree: (projectId: string, worktree: WorkspaceWorktree) => void;
  readonly onRestoreWorktree: (projectId: string, worktree: SettledWorktree) => void;
  readonly onRemoveWorktree: (projectId: string, worktree: SettledWorktree) => void;
  readonly onOpenAgent: (agent: WorkspaceAgent) => void;
  readonly onOpenDirectory: () => void;
}) {
  const [agentView, setAgentView] = useState<AgentView>("agents");
  const [spacesExpanded, setSpacesExpanded] = useState(true);
  const [agentsExpanded, setAgentsExpanded] = useState(true);
  const [agentViewDirection, setAgentViewDirection] = useState<"forward" | "backward">("forward");
  const [agentPaneMotion, setAgentPaneMotion] = useState<"horizontal" | "vertical">("vertical");
  const [searchQuery, setSearchQuery] = useState("");
  const [createProjectId, setCreateProjectId] = useState<string>();
  const [settledExpanded, setSettledExpanded] = useState(true);
  const settledShelfId = useId();
  const settledHeaderRef = useRef<HTMLButtonElement>(null);
  const pendingSettledFocusRef = useRef<{ readonly id: string; readonly index: number; readonly kind: "restore" | "remove" } | undefined>(undefined);
  const pendingArchiveFocusRef = useRef<{ readonly projectId: string; readonly worktreeId: string } | undefined>(undefined);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const settledEntries: readonly SettledWorktreeEntry[] = (snapshot.settledWorktrees ?? []).flatMap((worktree) => {
    const project = snapshot.projects.find((candidate) => candidate.id === worktree.projectId);
    return project === undefined ? [] : [{ project, worktree }];
  });
  const visibleProjects = normalizedQuery === "" ? snapshot.projects : snapshot.projects.filter((project) => {
    const activeWorktrees = project.worktreeIds.flatMap((id) => snapshot.worktrees.find((worktree) => worktree.id === id) ?? []);
    return matchesSearch(normalizedQuery, [project.label, project.path, ...activeWorktrees.flatMap((worktree) => [worktree.label, worktree.path])]);
  });
  const visibleSettledEntries = normalizedQuery === "" ? settledEntries : settledEntries.filter(({ project, worktree }) =>
    matchesSearch(normalizedQuery, [project.label, project.path, worktree.label, worktree.path]));
  const matchingAgents = normalizedQuery === "" ? snapshot.agents : snapshot.agents.filter((agent) => {
    const project = projectForAgent(snapshot, agent);
    const worktree = snapshot.worktrees.find((candidate) => candidate.id === agent.worktreeId);
    return matchesSearch(normalizedQuery, [agent.name, agent.summary, statusText(agent.status), project?.label, project?.path, worktree?.label, worktree?.path]);
  });
  const visibleAgentIds = normalizedQuery === "" ? new Set(snapshot.agents.map((agent) => agent.id)) : agentIdsWithAncestors(snapshot.agents, matchingAgents);
  const groupedAgents = normalizedQuery === "" ? snapshot.agents : snapshot.agents.filter((agent) => visibleAgentIds.has(agent.id));
  const priorityAgents = prioritizeRootAgents(matchingAgents);
  const visibleAgents = agentView === "priority" ? matchingAgents : groupedAgents;
  const visibleSnapshot = normalizedQuery === "" ? snapshot : { ...snapshot, agents: visibleAgents };
  const visibleAgentMatchCount = agentView === "priority" ? priorityAgents.length : matchingAgents.length;
  const searchResultStatus = `${visibleProjects.length} ${visibleProjects.length === 1 ? "Space" : "Spaces"}, ${visibleSettledEntries.length} settled ${visibleSettledEntries.length === 1 ? "worktree" : "worktrees"}, and ${visibleAgentMatchCount} ${visibleAgentMatchCount === 1 ? "Agent" : "Agents"} match your search.`;
  const changeAgentView = (next: AgentView) => {
    if (next === agentView) return;
    setAgentPaneMotion("horizontal");
    setAgentViewDirection(next === "priority" ? "forward" : "backward");
    setAgentView(next);
  };
  const toggleAgentsExpanded = () => {
    if (!agentsExpanded) setAgentPaneMotion("vertical");
    setAgentsExpanded((current) => !current);
  };
  const changeSearchQuery = (value: string) => {
    setSearchQuery(value);
    if (value.trim() === "") return;
    setCreateProjectId(undefined);
    setSpacesExpanded(true);
    if (!agentsExpanded) { setAgentPaneMotion("vertical"); setAgentsExpanded(true); }
  };
  const clearSearch = () => {
    setSearchQuery("");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const handledRevealRequestRef = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (!compact || !open) return;
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [compact, open]);
  useLayoutEffect(() => {
    if (!open || revealAgent === undefined || handledRevealRequestRef.current === revealAgent.requestId) return;
    if (!agentsExpanded) { setAgentPaneMotion("vertical"); setAgentsExpanded(true); return; }
    if (agentView !== "agents") { changeAgentView("agents"); return; }
    handledRevealRequestRef.current = revealAgent.requestId;
    const frame = requestAnimationFrame(() => {
      const row = document.getElementById(`workspace-agent-${encodeURIComponent(revealAgent.agentId)}`);
      if (!(row instanceof HTMLButtonElement)) return;
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [agentView, agentsExpanded, open, revealAgent]);
  useLayoutEffect(() => {
    if (createProjectId === undefined || snapshot.projects.some((project) => project.id === createProjectId)) return;
    setCreateProjectId(undefined);
  }, [createProjectId, snapshot.projects]);
  useLayoutEffect(() => {
    const pending = pendingArchiveFocusRef.current;
    if (pending === undefined || worktreeBusyOwner !== undefined) return;
    pendingArchiveFocusRef.current = undefined;
    if (snapshot.worktrees.some((worktree) => worktree.id === pending.worktreeId)) return;
    const frame = requestAnimationFrame(() => document.getElementById(`workspace-project-${encodeURIComponent(pending.projectId)}`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [snapshot.worktrees, worktreeBusyOwner]);
  useLayoutEffect(() => {
    const pending = pendingSettledFocusRef.current;
    if (pending === undefined || worktreeBusyOwner !== undefined) return;
    pendingSettledFocusRef.current = undefined;
    const target = settledEntries.find((entry) => entry.worktree.id === pending.id);
    if (target !== undefined) {
      if (pending.kind !== "remove" || target.worktree.checkoutPresent !== false) return;
      const frame = requestAnimationFrame(() => document.getElementById(`workspace-settled-restore-${encodeURIComponent(target.worktree.id)}`)?.focus());
      return () => cancelAnimationFrame(frame);
    }
    const candidates = [...settledEntries.slice(pending.index), ...settledEntries.slice(0, pending.index)].map((entry) => entry.worktree.id);
    const frame = requestAnimationFrame(() => {
      for (const id of candidates) {
        const button = document.getElementById(`workspace-settled-restore-${encodeURIComponent(id)}`);
        if (button instanceof HTMLButtonElement) { button.focus(); return; }
      }
      settledHeaderRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [settledEntries, worktreeBusyOwner]);
  const archiveWorktree = (projectId: string, worktree: WorkspaceWorktree) => {
    pendingArchiveFocusRef.current = { projectId, worktreeId: worktree.id };
    onArchiveWorktree(projectId, worktree);
  };
  const restoreWorktree = (projectId: string, worktree: SettledWorktree) => {
    pendingSettledFocusRef.current = { id: worktree.id, index: settledEntries.findIndex((entry) => entry.worktree.id === worktree.id), kind: "restore" };
    onRestoreWorktree(projectId, worktree);
  };
  const removeWorktree = (projectId: string, worktree: SettledWorktree) => {
    pendingSettledFocusRef.current = { id: worktree.id, index: settledEntries.findIndex((entry) => entry.worktree.id === worktree.id), kind: "remove" };
    onRemoveWorktree(projectId, worktree);
  };
  const priorityCount = priorityAgents.length;
  const workingWorktreeIds = new Set<string>();
  for (const agent of snapshot.agents) if (agent.status === "working") workingWorktreeIds.add(agent.worktreeId);
  return <aside
    id="workspace-navigation"
    className="workspace-sidebar"
    role={compact ? "dialog" : undefined}
    aria-label={compact ? undefined : "Workspace navigation"}
    aria-labelledby={compact ? "workspace-navigation-title" : undefined}
    aria-modal={compact && open ? true : undefined}
    aria-hidden={compact && !open}
    inert={compact && !open ? true : undefined}
    data-open={open}
    onKeyDown={compact && open ? trapDrawerFocus : undefined}
  >
    <header className="workspace-sidebar-title">
      <div className="workspace-sidebar-toolbar">
        <strong id="workspace-navigation-title">Ernie Dev</strong>
        <div className="workspace-sidebar-actions">
          {import.meta.env.DEV && !compact && <button type="button" className="performance-toggle" aria-pressed={performanceEnabled} aria-label={`${performanceEnabled ? "Hide" : "Show"} performance diagnostics`} title="Performance diagnostics" onClick={onTogglePerformance}><span aria-hidden="true" /></button>}
          <button ref={closeButtonRef} type="button" className="workspace-sidebar-close" aria-label="Close workspace navigation" title="Close sidebar (⌘B)" onClick={onClose}><Icon name="sidebar-close" /></button>
        </div>
      </div>
      <div className="workspace-sidebar-search">
        <Icon name="search" />
        <input ref={searchInputRef} type="search" value={searchQuery} aria-label="Search Spaces, Settled worktrees, and Agents" placeholder="Search" spellCheck={false} onChange={(event) => changeSearchQuery(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Escape" && searchQuery !== "") { event.preventDefault(); clearSearch(); } }} />
        {searchQuery !== "" && <button type="button" aria-label="Clear search" title="Clear search" onClick={clearSearch}><Icon name="close" /></button>}
      </div>
    </header>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{normalizedQuery === "" ? `Workspace status: ${loading ? "Loading spaces" : failed ? "Spaces unavailable; retrying automatically" : "Spaces available"}` : searchResultStatus}</div>
    <div className="workspace-sidebar-body" data-spaces-expanded={spacesExpanded} data-agents-expanded={agentsExpanded}>
      <section id="spaces-panel" className="workspace-projects" aria-labelledby="spaces-heading">
        <header className="workspace-section-heading">
          <h2 id="spaces-heading"><button type="button" className="workspace-spaces-disclosure" aria-expanded={spacesExpanded} aria-controls="spaces-list-panel" onClick={() => setSpacesExpanded((current) => !current)}><Icon name="folder" /><span>Spaces</span><Icon name="chevron" /></button></h2>
          <button type="button" aria-label="Open folder" title="Open folder" disabled={opening} onClick={onOpenDirectory}><Icon name="folder-add" /></button>
        </header>
        {spacesExpanded && <div id="spaces-list-panel" className="workspace-project-scroll">
          {failed && <p className="focused-message error" role="alert">Spaces are temporarily unavailable. Ernie will retry automatically.</p>}
          {openError && <p className="focused-message error" role="alert">{openError}</p>}
          {worktreeError && createProjectId === undefined && <p className="focused-message error" role="alert">{worktreeError}</p>}
          {loading && snapshot.projects.length === 0 && <p className="focused-message" role="status">Loading spaces…</p>}
          {normalizedQuery === "" && !loading && snapshot.projects.length === 0 && <FirstSpaceEmptyState opening={opening} onOpen={onOpenDirectory} />}
          {normalizedQuery !== "" && visibleProjects.length === 0 && <p className="focused-message">No spaces match your search.</p>}
          <ul className="workspace-project-list">{visibleProjects.map((project) => {
            const worktrees = project.worktreeIds.flatMap((id) => snapshot.worktrees.find((worktree) => worktree.id === id) ?? []);
            const rootWorktree = worktrees.find((worktree) => worktree.id === project.id) ?? worktrees[0];
            const projectMatches = normalizedQuery !== "" && matchesSearch(normalizedQuery, [project.label, project.path]);
            const visibleWorktrees = normalizedQuery === "" || projectMatches
              ? worktrees
              : worktrees.filter((worktree) => matchesSearch(normalizedQuery, [worktree.label, worktree.path]));
            const linkedWorktrees = visibleWorktrees.filter((worktree) => worktree.id !== rootWorktree?.id);
            return <SpaceRow
              key={project.id}
              project={project}
              rootWorktree={rootWorktree}
              linkedWorktrees={linkedWorktrees}
              forceExpanded={normalizedQuery !== "" && linkedWorktrees.length > 0}
              archivable={snapshot.projects[0]?.id !== project.id}
              archiving={archivingProjectId === project.id}
              activeProjectId={activeProjectId}
              activeWorktreeId={activeWorktreeId}
              workingWorktreeIds={workingWorktreeIds}
              createOpen={createProjectId === project.id}
              worktreeBusyOwner={worktreeBusyOwner}
              worktreeInteractionLocked={worktreeBusyOwner !== undefined || createProjectId !== undefined}
              createError={createProjectId === project.id ? worktreeError : undefined}
              onOpenCreate={setCreateProjectId}
              onCloseCreate={(projectId) => setCreateProjectId((current) => current === projectId ? undefined : current)}
              onCreateWorktree={onCreateWorktree}
              onSelectProject={onSelectProject}
              onSelectWorktree={onSelectWorktree}
              onArchiveProject={onArchiveProject}
              onArchiveWorktree={archiveWorktree}
            />;
          })}</ul>
          {visibleSettledEntries.length > 0 && <section className="workspace-settled" aria-labelledby="settled-heading">
            <h3 id="settled-heading">
              <button
                ref={settledHeaderRef}
                type="button"
                className="workspace-settled-disclosure"
                aria-expanded={normalizedQuery !== "" || settledExpanded}
                aria-controls={settledShelfId}
                onClick={() => { if (normalizedQuery === "") setSettledExpanded((current) => !current); }}
              ><Icon name="archive" /><span>Settled</span><small aria-label={`${visibleSettledEntries.length} ${visibleSettledEntries.length === 1 ? "worktree" : "worktrees"}`}>{visibleSettledEntries.length}</small><Icon name="chevron" /></button>
            </h3>
            <ul id={settledShelfId} className="workspace-settled-list" hidden={normalizedQuery === "" && !settledExpanded}>
              {(normalizedQuery !== "" || settledExpanded) && visibleSettledEntries.map((entry) => <SettledWorktreeRow
                key={entry.worktree.id}
                entry={entry}
                busy={worktreeBusyOwner === entry.worktree.id}
                disabled={worktreeBusyOwner !== undefined || createProjectId !== undefined}
                onRestore={restoreWorktree}
                onRemove={removeWorktree}
              />)}
            </ul>
          </section>}
        </div>}
      </section>
      <div className="workspace-section-divider" aria-hidden="true" />
      <section id="agents-panel" className="workspace-sessions" aria-labelledby="agents-heading">
        <header className="workspace-section-heading agent-heading">
          <h2 id="agents-heading"><button type="button" className="workspace-agents-disclosure" aria-expanded={agentsExpanded} aria-controls="agent-list-panel" onClick={toggleAgentsExpanded}>Agents <Icon name="chevron" /></button></h2>
          {agentsExpanded && <AgentViewTabs value={agentView} priorityCount={priorityCount} onChange={changeAgentView} />}
        </header>
        {agentsExpanded && <div id="agent-list-panel" className="workspace-session-scroll" role="tabpanel" aria-labelledby={agentView === "agents" ? "all-agents-tab" : "priority-tab"}>
          <div key={agentView} className="workspace-agent-pane" data-direction={agentViewDirection} data-motion={agentPaneMotion}>
            {agentView === "agents"
              ? <GroupedAgentPane snapshot={visibleSnapshot} activeWorktreeId={activeWorktreeId} activeAgentId={activeAgentId} expandIdleSubagents={normalizedQuery !== ""} includeEmptyActiveWorktree={normalizedQuery === ""} emptyMessage={normalizedQuery === "" ? undefined : "No agents match your search."} onOpenAgent={onOpenAgent} />
              : <PriorityAgentPane snapshot={visibleSnapshot} activeAgentId={activeAgentId} emptyMessage={normalizedQuery === "" ? undefined : "No agents match your search."} onOpenAgent={onOpenAgent} />}
          </div>
        </div>}
      </section>
    </div>
  </aside>;
}
