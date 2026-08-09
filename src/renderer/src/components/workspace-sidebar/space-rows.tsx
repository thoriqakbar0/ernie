import { useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArchiveIcon, EllipsisIcon, GitBranchPlusIcon } from "lucide-react";
import type { WorkspaceProject, WorkspaceSnapshot, WorkspaceWorktree } from "../../../../shared/workspace";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Icon } from "../ui/workspace-icon";

/** A worktree stored on the settled shelf. */
export type SettledWorktree = NonNullable<WorkspaceSnapshot["settledWorktrees"]>[number];

/** A settled worktree paired with its owning project. */
export interface SettledWorktreeEntry {
  readonly project: WorkspaceProject;
  readonly worktree: SettledWorktree;
}

function WorktreeRow({ projectId, worktree, active, working, busy, disabled, onSelect, onArchive }: {
  readonly projectId: string;
  readonly worktree: WorkspaceWorktree;
  readonly active: boolean;
  readonly working: boolean;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onSelect: (projectId: string, worktreeId: string) => void;
  readonly onArchive: (projectId: string, worktree: WorkspaceWorktree) => void;
}) {
  const label = `${worktree.label}${working ? ", working" : ""}`;
  const pathParts = worktree.path.split("/").filter(Boolean);
  const displayPath = pathParts.length <= 2 ? worktree.path : `…/${pathParts.slice(-2).join("/")}`;
  return <li className="workspace-worktree-connector-row">
    <div className={`workspace-worktree-control ${active ? "active" : ""}`} aria-busy={busy || undefined}>
      <button
        id={`workspace-worktree-${encodeURIComponent(worktree.id)}`}
        type="button"
        className="workspace-worktree-button"
        aria-current={active ? "page" : undefined}
        aria-label={label}
        title={worktree.path}
        onClick={() => onSelect(projectId, worktree.id)}
      >
        <span className="workspace-worktree-connector" aria-hidden="true" />
        <span className="workspace-worktree-copy">
          <span className="workspace-worktree-title">
            <strong>{worktree.label}</strong>
            <span className={`workspace-worktree-mark ${working ? "working" : ""}`} aria-hidden="true" />
          </span>
          <small>{displayPath}</small>
        </span>
      </button>
      <button
        type="button"
        className="workspace-worktree-archive"
        aria-label={`Archive ${worktree.label}`}
        title={`Move ${worktree.label} to Settled`}
        disabled={disabled}
        onClick={() => onArchive(projectId, worktree)}
      ><Icon name="archive" /></button>
    </div>
  </li>;
}

function CreateWorktreeForm({ id, project, sourceWorktree, busy, error, onCreate, onCancel }: {
  readonly id: string;
  readonly project: WorkspaceProject;
  readonly sourceWorktree: WorkspaceWorktree;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly onCreate: (projectId: string, sourceWorktreeId: string, branch: string) => void;
  readonly onCancel: (restoreFocus: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [branch, setBranch] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState<string>();
  const errorId = useId();
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = branch.trim();
    if (trimmed === "") {
      setValidationError("Enter a branch name.");
      inputRef.current?.focus();
      return;
    }
    setValidationError(undefined);
    setSubmitted(true);
    onCreate(project.id, sourceWorktree.id, trimmed);
  };
  const visibleError = validationError ?? (submitted ? error : undefined);
  return <form id={id} className="workspace-create-worktree" aria-label={`Create worktree in ${project.label}`} aria-busy={busy || undefined} onSubmit={submit} onKeyDown={(event) => {
    if (event.key !== "Escape" || busy) return;
    event.preventDefault();
    onCancel(true);
  }}>
    <label htmlFor={`worktree-branch-${encodeURIComponent(project.id)}`}>Branch name</label>
    <input
      ref={inputRef}
      id={`worktree-branch-${encodeURIComponent(project.id)}`}
      name="branch"
      value={branch}
      placeholder="feature/name"
      autoComplete="off"
      spellCheck={false}
      disabled={busy}
      aria-invalid={visibleError ? true : undefined}
      aria-describedby={visibleError ? errorId : undefined}
      onChange={(event) => { setBranch(event.currentTarget.value); setSubmitted(false); setValidationError(undefined); }}
    />
    <small>Starts from {sourceWorktree.label}</small>
    {visibleError && <p id={errorId} role="alert">{visibleError}</p>}
    <footer>
      <button type="button" disabled={busy} onClick={() => onCancel(true)}>Cancel</button>
      <button type="submit" disabled={busy}><Icon name="worktree-add" /><span>{busy ? "Creating…" : "Create worktree"}</span></button>
    </footer>
  </form>;
}

/** One settled-worktree row with restore and optional remove actions. */
export function SettledWorktreeRow({ entry, busy, disabled, onRestore, onRemove }: {
  readonly entry: SettledWorktreeEntry;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onRestore: (projectId: string, worktree: SettledWorktree) => void;
  readonly onRemove: (projectId: string, worktree: SettledWorktree) => void;
}) {
  const { project, worktree } = entry;
  const context = `${project.label} · ${worktree.label}`;
  const removable = worktree.managed === true && worktree.checkoutPresent !== false;
  return <li className="workspace-settled-row" aria-busy={busy || undefined} data-removable={removable}>
    <span className="workspace-settled-copy" title={`${context} — ${worktree.path}`}>
      <strong>{context}</strong>
      <small>{worktree.checkoutPresent === false ? "Checkout removed" : worktree.path}</small>
    </span>
    <button
      id={`workspace-settled-restore-${encodeURIComponent(worktree.id)}`}
      type="button"
      aria-label={`Restore ${worktree.label} to ${project.label}`}
      title={`Restore ${worktree.label}`}
      disabled={disabled}
      onClick={() => onRestore(project.id, worktree)}
    ><Icon name="restore" /></button>
    {removable && <button
      type="button"
      className="workspace-settled-remove"
      aria-label={`Remove checkout ${worktree.label} from ${project.label}`}
      title={`Remove checkout ${worktree.label}`}
      disabled={disabled}
      onClick={() => onRemove(project.id, worktree)}
    ><Icon name="trash" /></button>}
  </li>;
}

/** One project row with its linked-worktree controls. */
export function SpaceRow({ project, rootWorktree, linkedWorktrees, forceExpanded, archivable, archiving, activeProjectId, activeWorktreeId, workingWorktreeIds, createOpen, worktreeBusyOwner, worktreeInteractionLocked, createError, onOpenCreate, onCloseCreate, onCreateWorktree, onSelectProject, onSelectWorktree, onArchiveProject, onArchiveWorktree }: {
  readonly project: WorkspaceProject;
  readonly rootWorktree: WorkspaceWorktree | undefined;
  readonly linkedWorktrees: readonly WorkspaceWorktree[];
  readonly forceExpanded: boolean;
  readonly archivable: boolean;
  readonly archiving: boolean;
  readonly activeProjectId: string | undefined;
  readonly activeWorktreeId: string | undefined;
  readonly workingWorktreeIds: ReadonlySet<string>;
  readonly createOpen: boolean;
  readonly worktreeBusyOwner: string | undefined;
  readonly worktreeInteractionLocked: boolean;
  readonly createError: string | undefined;
  readonly onOpenCreate: (projectId: string) => void;
  readonly onCloseCreate: (projectId: string, restoreFocus: boolean) => void;
  readonly onCreateWorktree: (projectId: string, sourceWorktreeId: string, branch: string) => void;
  readonly onSelectProject: (projectId: string) => void;
  readonly onSelectWorktree: (projectId: string, worktreeId: string) => void;
  readonly onArchiveProject: (project: WorkspaceProject) => void;
  readonly onArchiveWorktree: (projectId: string, worktree: WorkspaceWorktree) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const worktreeListId = useId();
  const createFormId = useId();
  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const createWasBusyRef = useRef(false);
  const rootRuntimeId = rootWorktree?.id ?? project.id;
  const rootWorking = workingWorktreeIds.has(rootRuntimeId);
  const activeRoot = project.id === activeProjectId && (activeWorktreeId === undefined || activeWorktreeId === rootRuntimeId);
  const rootContext = rootWorktree?.label ?? "Local directory";
  const visibleRootContext = rootContext === project.label ? undefined : rootContext;
  const rootLabel = `${project.label}${visibleRootContext ? `, ${rootContext}` : ""}${rootWorking ? ", working" : ""}`;
  const activeLinkedWorktree = linkedWorktrees.find((worktree) => worktree.id === activeWorktreeId);
  const hasLinkedWorktrees = linkedWorktrees.length > 0;
  const displayedExpanded = forceExpanded || expanded;
  const sourceWorktree = project.id === activeProjectId
    ? linkedWorktrees.find((worktree) => worktree.id === activeWorktreeId) ?? rootWorktree
    : rootWorktree;
  const createBusy = createOpen && worktreeBusyOwner === project.id;
  const mutationBusy = worktreeInteractionLocked;
  useLayoutEffect(() => {
    if (!createOpen) { createWasBusyRef.current = false; return; }
    if (createBusy) { createWasBusyRef.current = true; return; }
    if (!createWasBusyRef.current || createError !== undefined) return;
    createWasBusyRef.current = false;
    onCloseCreate(project.id, false);
  }, [createBusy, createError, createOpen, onCloseCreate, project.id]);

  return <li className="workspace-project-node">
    <div className={`workspace-project-control ${activeRoot ? "active" : ""} ${hasLinkedWorktrees ? "has-disclosure" : ""}`}>
      <button id={`workspace-project-${encodeURIComponent(project.id)}`} type="button" className="workspace-project-row" aria-current={activeRoot ? "page" : undefined} aria-label={rootLabel} title={rootWorktree?.path ?? project.path} onClick={() => onSelectProject(project.id)}>
        <span className={`workspace-project-mark ${rootWorking ? "working" : ""}`} aria-hidden="true" />
        <span className="workspace-project-copy">
          <strong>{project.label}</strong>
          {visibleRootContext && <small>{visibleRootContext}</small>}
        </span>
      </button>
      <span className="workspace-project-actions" data-create-open={createOpen || undefined}>
        {(sourceWorktree || archivable) && <DropdownMenu>
          <DropdownMenuTrigger render={<Button
            ref={createTriggerRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            className="workspace-project-menu-trigger"
            aria-label={`More actions for ${project.label}`}
            title={`More actions for ${project.label}`}
            disabled={createBusy || archiving || mutationBusy}
          />}><EllipsisIcon data-icon="inline-start" aria-hidden="true" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            <DropdownMenuGroup>
              {sourceWorktree && <DropdownMenuItem aria-label={`Create worktree in ${project.label}`} onClick={() => onOpenCreate(project.id)}>
                <GitBranchPlusIcon data-icon="inline-start" aria-hidden="true" />
                <span>Create worktree</span>
              </DropdownMenuItem>}
              {archivable && <DropdownMenuItem aria-label={`Archive ${project.label}`} onClick={() => onArchiveProject(project)}>
                <ArchiveIcon data-icon="inline-start" aria-hidden="true" />
                <span>Archive Space</span>
              </DropdownMenuItem>}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>}
        {hasLinkedWorktrees && <button
          type="button"
          className={`workspace-project-disclosure ${displayedExpanded ? "expanded" : ""}`}
          aria-expanded={displayedExpanded}
          aria-controls={worktreeListId}
          aria-label={`${displayedExpanded ? "Hide" : "Show"} linked worktrees for ${project.label}`}
          title={`${displayedExpanded ? "Hide" : "Show"} linked worktrees`}
          onClick={() => setExpanded((current) => !current)}
        ><Icon name="chevron" /></button>}
      </span>
    </div>
    {createOpen && sourceWorktree && <CreateWorktreeForm
      id={createFormId}
      project={project}
      sourceWorktree={sourceWorktree}
      busy={createBusy}
      error={createError}
      onCreate={onCreateWorktree}
      onCancel={(restoreFocus) => {
        onCloseCreate(project.id, restoreFocus);
        if (restoreFocus) requestAnimationFrame(() => createTriggerRef.current?.focus());
      }}
    />}
    {hasLinkedWorktrees && <div id={worktreeListId} hidden={!displayedExpanded}>
      {displayedExpanded && <ul className="workspace-worktree-list workspace-linked-worktree-list" aria-label={`Linked worktrees for ${project.label}`}>
        {linkedWorktrees.map((worktree) => <WorktreeRow
          key={worktree.id}
          projectId={project.id}
          worktree={worktree}
          active={project.id === activeProjectId && worktree.id === activeWorktreeId}
          working={workingWorktreeIds.has(worktree.id)}
          busy={worktreeBusyOwner === worktree.id}
          disabled={mutationBusy}
          onSelect={onSelectWorktree}
          onArchive={onArchiveWorktree}
        />)}
      </ul>}
    </div>}
    {!displayedExpanded && activeLinkedWorktree && <ul
      className="workspace-worktree-list workspace-linked-worktree-list workspace-active-worktree-context"
      aria-label={`Active worktree in ${project.label}`}
      data-collapsed="true"
    >
      <WorktreeRow
        projectId={project.id}
        worktree={activeLinkedWorktree}
        active
        working={workingWorktreeIds.has(activeLinkedWorktree.id)}
        busy={worktreeBusyOwner === activeLinkedWorktree.id}
        disabled={mutationBusy}
        onSelect={onSelectWorktree}
        onArchive={onArchiveWorktree}
      />
    </ul>}
  </li>;
}

/** Empty state shown before the first space exists. */
export function FirstSpaceEmptyState({ opening, onOpen }: {
  readonly opening: boolean;
  readonly onOpen: () => void;
}) {
  return <div className="workspace-empty-state">
    <p>No spaces yet. Open a local folder to create one.</p>
    <button type="button" className="workspace-empty-action" disabled={opening} onClick={onOpen}><Icon name="folder-add" /><span>{opening ? "Opening folder…" : "Open folder"}</span></button>
  </div>;
}
