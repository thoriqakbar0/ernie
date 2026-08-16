import {
  ArchiveIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  CopyIcon,
  MessageCircleQuestionIcon,
  PanelLeftCloseIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  RotateCcwIcon,
  XIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { ThinkingOrb } from 'thinking-orbs';

import { RenameAgentConversationDialog } from '@/components/rename-agent-conversation-dialog';
import {
  RepositoryDialog,
  type RepositoryDialogTarget,
} from '@/components/repository-dialog';
import { AgentConversationRow } from '@/components/agent-conversation-row';
import { Button } from '@/components/trovecn/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/trovecn/ui/context-menu';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/trovecn/ui/dialog';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import type {
  AgentWorkspaceComposerController,
  AgentWorkspaceConnectionController,
  AgentWorkspaceNavigationController,
} from '@/packages/agent-workspace';
import { useRepositoryNavigation } from '@/hooks/use-repository-navigation';
import {
  projectRepositoryNavigation,
  transitionRepositoryNavigation,
  type AgentConversation,
  type RepositoryNavigationCommand,
  type RepositoryNavigationRepository,
  type RepositoryNavigationSource,
  type RepositoryNavigationWorkspace,
} from '@/packages/repository-navigation';
import type { ThinkingOrbState } from '@/thinking-orb-preference';

type AgentSidebarProps = Pick<
  AgentWorkspaceNavigationController,
  | 'folders'
  | 'importingSessionPath'
  | 'renamingSession'
  | 'savedSessions'
  | 'selectedCwd'
  | 'selectedSessionId'
  | 'sessions'
  | 'changeFolder'
  | 'addWorkspaceDirectory'
  | 'startAgentDraft'
  | 'importSession'
  | 'renameSession'
  | 'selectSession'
> & Pick<AgentWorkspaceConnectionController, 'primeAgentConnection'> &
  Pick<AgentWorkspaceComposerController, 'creatingAgent'> & {
  readonly onOpenSettings: () => void;
  readonly settingsOpen: boolean;
  readonly thinkingOrbState: ThinkingOrbState;
};

type WorkspaceGroup = RepositoryNavigationWorkspace;
type RepositoryGroup = RepositoryNavigationRepository;

interface DraggedConversation {
  readonly cwd: string;
  readonly id: string;
  readonly pinned: boolean;
}

interface ArchiveUndo {
  readonly id: string;
  readonly name: string;
  readonly wasPinned: boolean;
}

const branchColorClasses = [
  'text-blue-700 dark:text-blue-300',
  'text-violet-700 dark:text-violet-300',
  'text-emerald-700 dark:text-emerald-300',
  'text-amber-700 dark:text-amber-300',
  'text-rose-700 dark:text-rose-300',
  'text-cyan-700 dark:text-cyan-300',
] as const;

function branchColorClass(branchName: string): string {
  let hash = 0;
  for (const character of branchName) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return branchColorClasses[hash % branchColorClasses.length]!;
}

function agentConversationId(conversation: AgentConversation): string {
  return conversation.id;
}

function conversationActivity(conversation: AgentConversation) {
  return conversation.activity;
}

function sessionAge(modifiedAt: string | null): string | null {
  if (modifiedAt === null) return null;
  const modifiedTime = Date.parse(modifiedAt);
  if (!Number.isFinite(modifiedTime)) return null;

  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - modifiedTime) / 60_000),
  );
  if (elapsedMinutes < 60) return `${Math.max(1, elapsedMinutes)}m`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return elapsedDays < 7 ? `${elapsedDays}d` : null;
}

function ActivitySummary({
  needsInputCount,
  thinkingOrbState,
  workingCount,
}: {
  readonly needsInputCount: number;
  readonly thinkingOrbState: ThinkingOrbState;
  readonly workingCount: number;
}): React.JSX.Element | null {
  if (needsInputCount === 0 && workingCount === 0) return null;

  const needsInputLabel = `${needsInputCount} ${needsInputCount === 1 ? 'Agent needs' : 'Agents need'} input`;

  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
      {needsInputCount > 0 ? (
        <span
          className="inline-flex items-center gap-0.5 font-medium text-warning"
          title={needsInputLabel}
        >
          <MessageCircleQuestionIcon aria-hidden="true" className="size-3" />
          <span className="tabular-nums">{needsInputCount}</span>
          <span className="sr-only">
            {needsInputCount === 1 ? ' Agent needs input' : ' Agents need input'}
          </span>
        </span>
      ) : null}
      {workingCount > 0 ? (
        <span
          className="inline-flex items-center gap-1 tabular-nums"
          title={`${workingCount} ${workingCount === 1 ? 'Agent' : 'Agents'} working`}
        >
          <ThinkingOrb
            aria-hidden="true"
            className="shrink-0"
            data-thinking-orb-state={thinkingOrbState}
            size={20}
            state={thinkingOrbState}
            theme="auto"
          />
          {workingCount}
          <span className="sr-only">
            {workingCount === 1 ? ' Agent working' : ' Agents working'}
          </span>
        </span>
      ) : null}
    </span>
  );
}

function repositoryForCwd(
  repositories: readonly RepositoryGroup[],
  cwd: string | null,
): RepositoryGroup | null {
  if (cwd === null) return null;
  return (
    repositories.find((repository) =>
      repository.workspaces.some((workspace) => workspace.folder.value === cwd),
    ) ?? null
  );
}

/** Repository navigation with quiet status, disclosure, search, and pins. */
export function AgentSidebar({
  creatingAgent,
  folders,
  importingSessionPath,
  primeAgentConnection,
  renamingSession,
  savedSessions,
  selectedCwd,
  selectedSessionId,
  sessions,
  changeFolder,
  addWorkspaceDirectory,
  startAgentDraft,
  importSession,
  renameSession,
  selectSession,
  onOpenSettings,
  settingsOpen,
  thinkingOrbState,
}: AgentSidebarProps): React.JSX.Element {
  const [renameTarget, setRenameTarget] = useState<AgentConversation | null>(
    null,
  );
  const [repositoryDialog, setRepositoryDialog] =
    useState<RepositoryDialogTarget | null>(null);
  const [connectionDetailsOpen, setConnectionDetailsOpen] = useState(false);
  const [draggedConversation, setDraggedConversation] = useState<DraggedConversation | null>(null);
  const [archiveUndo, setArchiveUndo] = useState<ArchiveUndo | null>(null);
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [pinsExpanded, setPinsExpanded] = useState(false);
  const [settledExpandedPaths, setSettledExpandedPaths] = useState(
    () => new Set<string>(),
  );
  const [worktreesExpandedPaths, setWorktreesExpandedPaths] = useState(
    () => new Set<string>(),
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingAddedCwd, setPendingAddedCwd] = useState<string | null>(null);
  const [revealedWorkspaceCwd, setRevealedWorkspaceCwd] = useState<string | null>(
    null,
  );
  const [navigationPreferences, setNavigationPreferences] = useRepositoryNavigation();
  const navigationRef = useRef<HTMLDivElement>(null);
  const initializedDisclosure = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const connected = primeAgentConnection === 'ready';
  const navigationSource = useMemo<RepositoryNavigationSource>(
    () => ({
      connected,
      folders,
      importingSessionPath,
      liveSessions: sessions,
      savedSessions,
      selectedSessionId,
    }),
    [
      connected,
      folders,
      importingSessionPath,
      savedSessions,
      selectedSessionId,
      sessions,
    ],
  );
  const navigation = useMemo(
    () =>
      projectRepositoryNavigation(navigationSource, navigationPreferences, {
        pinsExpanded,
        revealedWorkspaceCwd,
        searchQuery,
        selectedCwd,
        settledExpandedRepositoryPaths: settledExpandedPaths,
        worktreesExpandedRepositoryPaths: worktreesExpandedPaths,
      }),
    [
      navigationPreferences,
      navigationSource,
      pinsExpanded,
      revealedWorkspaceCwd,
      searchQuery,
      selectedCwd,
      settledExpandedPaths,
      worktreesExpandedPaths,
    ],
  );
  const applyNavigationCommand = useCallback(
    (command: RepositoryNavigationCommand): void => {
      setNavigationPreferences((current) =>
        transitionRepositoryNavigation(current, navigationSource, command),
      );
    },
    [navigationSource, setNavigationPreferences],
  );
  const {
    archivedConversations,
    archivedWorkspaces,
    hiddenPinCount,
    pinnedConversations,
    repositories,
    searchResults,
    selectedConversationId,
    visiblePinnedConversations,
    visibleRepositories,
    visibleRepositoryViews,
  } = navigation;
  const selectedLiveSession = sessions.find(
    (session) => session.activeSessionId === selectedSessionId,
  );

  useEffect(() => {
    if (
      selectedConversationId === null ||
      selectedLiveSession === undefined ||
      selectedLiveSession.modifiedAt === null
    ) {
      return;
    }
    applyNavigationCommand({
      type: 'mark-viewed',
      conversationId: selectedConversationId,
      viewedAt: selectedLiveSession.modifiedAt,
    });
  }, [applyNavigationCommand, selectedLiveSession?.modifiedAt, selectedConversationId]);

  useEffect(() => {
    const openSearch = (event: globalThis.KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'k' || !event.metaKey) return;
      event.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const openAllConversations = (event: globalThis.KeyboardEvent): void => {
      if (
        event.key.toLowerCase() !== 'o' ||
        !event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      const repositoryPaths = repositories.map(
        (repository) => repository.folder.value,
      );
      setPinsExpanded(true);
      setArchiveExpanded(true);
      setSettledExpandedPaths(new Set(repositoryPaths));
      setWorktreesExpandedPaths(new Set(repositoryPaths));
    };
    window.addEventListener('keydown', openAllConversations);
    return () => window.removeEventListener('keydown', openAllConversations);
  }, [repositories]);

  useEffect(() => {
    applyNavigationCommand({ type: 'remember-repositories' });
  }, [applyNavigationCommand, repositories]);

  useEffect(() => {
    if (pendingAddedCwd === null) return;
    const repository = repositoryForCwd(repositories, pendingAddedCwd);
    if (repository === null) return;
    applyNavigationCommand({
      type: 'set-repository-hidden',
      repositoryPath: repository.folder.value,
      hidden: false,
    });
    applyNavigationCommand({
      type: 'set-expanded-repository',
      repositoryPath: repository.folder.value,
    });
    setPendingAddedCwd(null);
  }, [applyNavigationCommand, pendingAddedCwd, repositories]);

  const addRepository = (): void => {
    void addWorkspaceDirectory().then((cwd) => {
      if (cwd !== null) setPendingAddedCwd(cwd);
    });
  };

  const revealWorkspace = (workspacePath: string): void => {
    void window.ernie.revealWorkspacePath(workspacePath);
  };

  const copyBranchName = (branchName: string): void => {
    if (navigator.clipboard === undefined) return;
    void navigator.clipboard.writeText(branchName).catch(() => undefined);
  };

  useEffect(() => {
    if (initializedDisclosure.current || visibleRepositories.length === 0) return;
    initializedDisclosure.current = true;
    if (navigationPreferences.expandedRepositoryPath !== null) return;
    const selectedRepository = repositoryForCwd(visibleRepositories, selectedCwd);
    applyNavigationCommand({
      type: 'set-expanded-repository',
      repositoryPath:
        selectedRepository?.folder.value ??
        visibleRepositories[0]?.folder.value ??
        null,
    });
  }, [
    applyNavigationCommand,
    navigationPreferences.expandedRepositoryPath,
    selectedCwd,
    visibleRepositories,
  ]);

  const clearSearch = (): void => {
    setSearchQuery('');
    setSearchOpen(false);
  };

  const openConversation = (conversation: AgentConversation): void => {
    if (conversation.kind === 'live') {
      selectSession(conversation.session.activeSessionId);
    } else {
      importSession(conversation.session.path);
    }
  };

  const moveConversation = (
    cwd: string,
    sourceId: string,
    targetId: string,
  ): void => {
    applyNavigationCommand({
      type: 'move-conversation',
      workspacePath: cwd,
      sourceConversationId: sourceId,
      targetConversationId: targetId,
    });
  };

  const renderConversation = (
    conversation: AgentConversation,
    workspace: WorkspaceGroup,
    pinned: boolean,
    detail: string | null,
    visibleConversations: readonly AgentConversation[],
    archived = false,
  ): React.JSX.Element => {
    const id = agentConversationId(conversation);
    const importing =
      conversation.kind === 'saved' &&
      importingSessionPath === conversation.session.path;
    const activity = conversationActivity(conversation);
    const label = conversation.session.name;
    const conversationIndex = visibleConversations.findIndex(
      (candidate) => agentConversationId(candidate) === id,
    );
    const moveToIndex = (targetIndex: number): void => {
      const target = visibleConversations[targetIndex];
      if (target === undefined) return;
      const targetId = agentConversationId(target);
      if (pinned) {
        applyNavigationCommand({
          type: 'move-pinned-conversation',
          sourceConversationId: id,
          targetConversationId: targetId,
        });
      } else {
        moveConversation(workspace.folder.value, id, targetId);
      }
    };

    return (
      <AgentConversationRow
        key={id}
        activity={activity}
        archived={archived}
        detail={detail}
        disabled={importingSessionPath !== null}
        dragging={draggedConversation?.id === id}
        importing={importing}
        label={label}
        pinned={pinned}
        selected={id === selectedConversationId}
        thinkingOrbState={thinkingOrbState}
        conversation={conversation}
        onArchiveChange={(archived) => {
          if (archived) {
            setArchiveUndo({ id, name: conversation.session.name, wasPinned: pinned });
            applyNavigationCommand({
              type: 'set-conversation-archived',
              conversationId: id,
              archived: true,
            });
          } else {
            applyNavigationCommand({
              type: 'set-conversation-archived',
              conversationId: id,
              archived: false,
            });
            if (archiveUndo?.id === id) setArchiveUndo(null);
          }
        }}
        onDragEnd={() => setDraggedConversation(null)}
        onDragStart={(event: DragEvent<HTMLLIElement>) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', id);
          setDraggedConversation({ cwd: workspace.folder.value, id, pinned });
        }}
        onDrop={(event: DragEvent<HTMLLIElement>) => {
          event.preventDefault();
          if (draggedConversation === null) return;
          if (pinned && draggedConversation.pinned) {
            applyNavigationCommand({
              type: 'move-pinned-conversation',
              sourceConversationId: draggedConversation.id,
              targetConversationId: id,
            });
          } else if (
            !pinned &&
            !draggedConversation.pinned &&
            draggedConversation.cwd === workspace.folder.value
          ) {
            moveConversation(
              workspace.folder.value,
              draggedConversation.id,
              id,
            );
          }
          setDraggedConversation(null);
        }}
        onOpen={() => openConversation(conversation)}
        onMoveDown={
          archived || conversationIndex < 0 || conversationIndex >= visibleConversations.length - 1
            ? undefined
            : () => moveToIndex(conversationIndex + 1)
        }
        onMoveUp={
          archived || conversationIndex <= 0
            ? undefined
            : () => moveToIndex(conversationIndex - 1)
        }
        onPinChange={(nextPinned) =>
          applyNavigationCommand({
            type: 'set-conversation-pinned',
            conversationId: id,
            pinned: nextPinned,
          })
        }
        onRename={() => setRenameTarget(conversation)}
      />
    );
  };

  const handleTreeKeys = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = Array.from(
      navigationRef.current?.querySelectorAll<HTMLElement>(
        '[data-sidebar-tree-row]:not([disabled])',
      ) ?? [],
    ).filter((row) => row.closest('[hidden]') === null);
    if (rows.length === 0) return;
    const currentIndex = rows.indexOf(event.target as HTMLElement);
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, currentIndex + direction));
    event.preventDefault();
    rows[nextIndex]?.focus();
  };

  return (
    <Sidebar collapsible="offcanvas" desktopOffset={48}>
      <SidebarHeader className="gap-0 px-2 pb-1 pt-3">
        {searchOpen ? (
          <div className="flex h-8 items-center px-1">
            <div className="flex h-8 min-w-0 flex-1 items-center gap-1 rounded-lg bg-sidebar-accent px-2">
              <SearchIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="search"
                aria-label="Search repositories, worktrees, and Agents"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return;
                  event.stopPropagation();
                  if (searchQuery.length > 0) {
                    setSearchQuery('');
                  } else {
                    setSearchOpen(false);
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Close search"
                onClick={clearSearch}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}

        {pinnedConversations.length > 0 || draggedConversation !== null ? (
          <section
            aria-label="Pinned tasks"
            className="mb-1 pb-1"
            onDragOver={(event) => {
              if (draggedConversation === null || draggedConversation.pinned) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedConversation === null || draggedConversation.pinned) return;
              applyNavigationCommand({
                type: 'set-conversation-pinned',
                conversationId: draggedConversation.id,
                pinned: true,
              });
              setDraggedConversation(null);
            }}
          >
            <div className="flex h-7 items-center px-2">
              <SidebarGroupLabel className="h-auto flex-1 px-0 text-xs font-medium">
                {pinnedConversations.length === 0 ? 'Drop to pin' : 'Pinned'}
              </SidebarGroupLabel>
            </div>
            <ul className="flex flex-col gap-0.5">
              {visiblePinnedConversations.map(
                ({ conversation, repository, workspace }) =>
                  renderConversation(
                    conversation,
                    workspace,
                    true,
                    workspace.folder.value === repository.folder.value
                      ? repository.folder.label
                      : `${repository.folder.label} · ${workspace.folder.branchName ?? workspace.folder.label}`,
                    pinnedConversations.map((item) => item.conversation),
                  ),
              )}
            </ul>
            {hiddenPinCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="ml-4 justify-start text-xs text-muted-foreground"
                onClick={() => setPinsExpanded((current) => !current)}
              >
                {pinsExpanded ? 'Show fewer pins' : `More pins (${hiddenPinCount})`}
              </Button>
            ) : null}
          </section>
        ) : null}

        <div className="flex h-8 items-center gap-0.5 px-2">
          <SidebarGroupLabel className="h-auto flex-1 px-0 text-xs font-medium">
            Repositories
          </SidebarGroupLabel>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Add repository"
            title="Add repository"
            onClick={addRepository}
          >
            <FolderPlusIcon aria-hidden="true" />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <div ref={navigationRef} onKeyDown={handleTreeKeys}>
              {searchOpen && searchQuery.trim().length > 0 ? (
                searchResults.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-3 py-8 text-xs text-muted-foreground">
                    <span>No matches</span>
                    <Button type="button" variant="ghost" size="xs" onClick={() => setSearchQuery('')}>
                      Clear
                    </Button>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {searchResults.map((result) => (
                      <li key={result.key}>
                        <Button
                          type="button"
                          variant="ghost"
                          data-sidebar-tree-row
                          aria-label={
                            result.kind === 'Agent' && result.conversation.kind === 'saved'
                              ? `${result.label}, saved session`
                              : result.label
                          }
                          className="h-10 w-full min-w-0 justify-start px-2 text-left font-normal"
                          onClick={() => {
                            if (result.kind === 'Agent') {
                              openConversation(result.conversation);
                            } else {
                              applyNavigationCommand({
                                type: 'set-expanded-repository',
                                repositoryPath: result.repositoryPath,
                              });
                              setRevealedWorkspaceCwd(
                                result.kind === 'worktree'
                                  ? result.workspacePath
                                  : null,
                              );
                            }
                            clearSearch();
                          }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{result.label}</span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {result.breadcrumb}
                            </span>
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )
              ) : visibleRepositories.length === 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 w-full justify-start gap-2 px-2 text-sm font-normal text-muted-foreground"
                  onClick={addRepository}
                >
                  <FolderPlusIcon aria-hidden="true" />
                  Add repository
                </Button>
              ) : (
                <ul className="flex flex-col gap-1">
                  {visibleRepositoryViews.map((repositoryView, index) => {
                    const {
                      hiddenSettledCount,
                      hiddenWorktreeCount,
                      needsInputCount,
                      repository,
                      rootWorkspace,
                      visibleWorktrees,
                      workingCount,
                    } = repositoryView;
                    const { folder } = repository;
                    const settledExpanded = settledExpandedPaths.has(folder.value);
                    const worktreesExpanded = worktreesExpandedPaths.has(folder.value);
                    const expanded =
                      navigationPreferences.expandedRepositoryPath === folder.value;
                    const repositoryActive =
                      selectedConversationId === null && selectedCwd === folder.value;
                    const repositoryActiveClass = repositoryActive
                      ? 'bg-sidebar-accent/60 aria-expanded:bg-sidebar-accent/60'
                      : 'aria-expanded:bg-transparent';
                    const conversationsId = `repository-${index}-conversations`;
                    return (
                      <li key={folder.value} aria-label={`${folder.label} repository`}>
                        <div className="group/repository relative flex items-center">
                          <ContextMenu>
                            <ContextMenuTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  data-active={repositoryActive}
                                  data-sidebar-tree-row
                                  className={`h-9 min-w-0 flex-1 justify-start gap-2 px-2 pr-9 text-[13px] font-medium ${repositoryActiveClass}`}
                                  aria-label={folder.label}
                                  aria-controls={conversationsId}
                                  aria-expanded={expanded}
                                  onClick={() => {
                                    setRevealedWorkspaceCwd(null);
                                    changeFolder(folder.value);
                                    applyNavigationCommand({
                                      type: 'set-expanded-repository',
                                      repositoryPath: expanded ? null : folder.value,
                                    });
                                  }}
                                />
                              }
                            >
                              <ChevronRightIcon
                                aria-hidden="true"
                                className="transition-transform duration-120 data-[expanded=true]:rotate-90 motion-reduce:transition-none"
                                data-expanded={expanded}
                              />
                              <FolderIcon aria-hidden="true" />
                              <span className="truncate">{folder.label}</span>
                              <ActivitySummary
                                needsInputCount={needsInputCount}
                                thinkingOrbState={thinkingOrbState}
                                workingCount={workingCount}
                              />
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem
                                onClick={() =>
                                  setRepositoryDialog({
                                    kind: 'rename',
                                    label: folder.label,
                                    path: folder.value,
                                  })
                                }
                              >
                                <PencilIcon />
                                Rename display label
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() => revealWorkspace(folder.value)}
                              >
                                <FolderOpenIcon />
                                Reveal in Finder
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={() =>
                                  setRepositoryDialog({
                                    kind: 'remove',
                                    label: folder.label,
                                    path: folder.value,
                                  })
                                }
                              >
                                <PanelLeftCloseIcon />
                                Remove from sidebar
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-120 group-focus-within/repository:pointer-events-auto group-focus-within/repository:opacity-100 group-hover/repository:pointer-events-auto group-hover/repository:opacity-100 motion-reduce:transition-none"
                            aria-label={`New Agent in ${folder.label}`}
                            title={`New Agent in ${folder.label}`}
                            disabled={creatingAgent}
                            onClick={() => startAgentDraft(folder.value)}
                          >
                            <PlusIcon aria-hidden="true" />
                          </Button>
                        </div>
                        <div
                          id={conversationsId}
                          hidden={!expanded}
                          className="grid transition-[grid-template-rows,opacity] duration-120 data-[expanded=false]:grid-rows-[0fr] data-[expanded=false]:opacity-0 data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100 motion-reduce:transition-none"
                          data-expanded={expanded}
                          onDragOver={(event) => {
                            if (
                              draggedConversation?.pinned !== true ||
                              draggedConversation.cwd !== folder.value
                            ) {
                              return;
                            }
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(event) => {
                            if (
                              draggedConversation?.pinned !== true ||
                              draggedConversation.cwd !== folder.value
                            ) {
                              return;
                            }
                            event.preventDefault();
                            applyNavigationCommand({
                              type: 'set-conversation-pinned',
                              conversationId: draggedConversation.id,
                              pinned: false,
                            });
                            setDraggedConversation(null);
                          }}
                        >
                          <ul className="mt-0.5 ml-4 flex min-h-0 flex-col gap-0.5 overflow-hidden">
                            {rootWorkspace === null
                              ? null
                              : rootWorkspace.visibleConversations.map((conversation) =>
                                  renderConversation(
                                    conversation,
                                    rootWorkspace.workspace,
                                    false,
                                    sessionAge(conversation.session.modifiedAt),
                                    rootWorkspace.visibleConversations,
                                  ),
                                )}
                            {visibleWorktrees.map(
                              ({
                                needsInputCount: workspaceNeedsInputCount,
                                visibleConversations,
                                workingCount: workspaceWorkingCount,
                                workspace,
                              }) => {
                                const workspaceLabel =
                                  workspace.folder.branchName ?? workspace.folder.label;
                                const worktreeActive =
                                  selectedConversationId === null &&
                                  selectedCwd === workspace.folder.value;
                                return (
                                  <li
                                    key={workspace.folder.value}
                                    aria-label={`${workspaceLabel} worktree`}
                                    className="mt-1"
                                    onDragOver={(event) => {
                                      if (
                                        draggedConversation?.pinned !== true ||
                                        draggedConversation.cwd !== workspace.folder.value
                                      ) {
                                        return;
                                      }
                                      event.preventDefault();
                                      event.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      if (
                                        draggedConversation?.pinned !== true ||
                                        draggedConversation.cwd !== workspace.folder.value
                                      ) {
                                        return;
                                      }
                                      applyNavigationCommand({
                                        type: 'set-conversation-pinned',
                                        conversationId: draggedConversation.id,
                                        pinned: false,
                                      });
                                      setDraggedConversation(null);
                                    }}
                                  >
                                    <ContextMenu>
                                      <ContextMenuTrigger
                                        render={
                                          <div
                                            data-active={worktreeActive}
                                            className={`group/worktree flex h-8 items-center gap-1 px-2 ${worktreeActive ? 'rounded-lg bg-sidebar-accent/60' : ''}`}
                                          />
                                        }
                                      >
                                        <span
                                          className={`min-w-0 flex-1 truncate font-mono text-xs font-medium ${branchColorClass(workspaceLabel)}`}
                                          title={workspaceLabel}
                                        >
                                          {workspaceLabel}
                                        </span>
                                        <ActivitySummary
                                          needsInputCount={workspaceNeedsInputCount}
                                          thinkingOrbState={thinkingOrbState}
                                          workingCount={workspaceWorkingCount}
                                        />
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-xs"
                                          className="pointer-events-none opacity-0 transition-opacity duration-120 group-focus-within/worktree:pointer-events-auto group-focus-within/worktree:opacity-100 group-hover/worktree:pointer-events-auto group-hover/worktree:opacity-100 motion-reduce:transition-none"
                                          aria-label={`New Agent in ${workspaceLabel}`}
                                          title={`New Agent in ${workspaceLabel}`}
                                          disabled={creatingAgent}
                                          onClick={() =>
                                            startAgentDraft(workspace.folder.value)
                                          }
                                        >
                                          <PlusIcon aria-hidden="true" />
                                        </Button>
                                      </ContextMenuTrigger>
                                      <ContextMenuContent>
                                        <ContextMenuItem
                                          onClick={() => copyBranchName(workspaceLabel)}
                                        >
                                          <CopyIcon />
                                          Copy branch name
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                          onClick={() =>
                                            revealWorkspace(workspace.folder.value)
                                          }
                                        >
                                          <FolderOpenIcon />
                                          Reveal in Finder
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                          onClick={() =>
                                            applyNavigationCommand({
                                              type: 'set-workspace-archived',
                                              workspacePath: workspace.folder.value,
                                              archived: true,
                                            })
                                          }
                                        >
                                          <ArchiveIcon />
                                          Archive branch
                                        </ContextMenuItem>
                                      </ContextMenuContent>
                                    </ContextMenu>
                                    <ul className="ml-2 flex flex-col gap-0.5">
                                      {visibleConversations.map((conversation) =>
                                        renderConversation(
                                          conversation,
                                          workspace,
                                          false,
                                          sessionAge(conversation.session.modifiedAt),
                                          visibleConversations,
                                        ),
                                      )}
                                    </ul>
                                  </li>
                                );
                              },
                            )}
                            {hiddenWorktreeCount > 0 ? (
                              <li>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  className="ml-2 justify-start text-xs text-muted-foreground"
                                  onClick={() =>
                                    setWorktreesExpandedPaths((current) => {
                                      const next = new Set(current);
                                      if (next.has(folder.value)) {
                                        next.delete(folder.value);
                                      } else {
                                        next.add(folder.value);
                                      }
                                      return next;
                                    })
                                  }
                                >
                                  {worktreesExpanded
                                    ? 'Show fewer worktrees'
                                    : `More worktrees (${hiddenWorktreeCount})`}
                                </Button>
                              </li>
                            ) : null}
                            {hiddenSettledCount > 0 ? (
                              <li>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  className="ml-2 justify-start text-xs text-muted-foreground"
                                  onClick={() =>
                                    setSettledExpandedPaths((current) => {
                                      const next = new Set(current);
                                      if (next.has(folder.value)) {
                                        next.delete(folder.value);
                                      } else {
                                        next.add(folder.value);
                                      }
                                      return next;
                                    })
                                  }
                                >
                                  {settledExpanded
                                    ? 'Hide settled'
                                    : `Settled (${hiddenSettledCount})`}
                                </Button>
                              </li>
                            ) : null}
                          </ul>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {archivedConversations.length === 0 &&
            archivedWorkspaces.length === 0 ? null : (
              <section aria-label="Archived sidebar items" className="mt-2 border-t border-sidebar-border pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-1.5 px-2 text-xs font-medium"
                  aria-expanded={archiveExpanded}
                  onClick={() => setArchiveExpanded((current) => !current)}
                >
                  <ChevronRightIcon
                    aria-hidden="true"
                    className={`size-3 transition-transform motion-reduce:transition-none ${archiveExpanded ? 'rotate-90' : ''}`}
                  />
                  Archived ({archivedConversations.length + archivedWorkspaces.length})
                </Button>
                {archiveExpanded ? (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {archivedWorkspaces.map(({ repository, workspace }) => {
                      const branchName =
                        workspace.folder.branchName ?? workspace.folder.label;
                      return (
                        <li
                          key={workspace.folder.value}
                          className="group/archived-branch flex h-8 items-center gap-1 px-2"
                        >
                          <ArchiveIcon
                            aria-hidden="true"
                            className="size-3.5 shrink-0 text-muted-foreground"
                          />
                          <span
                            className={`min-w-0 flex-1 truncate font-mono text-xs ${branchColorClass(branchName)}`}
                            title={`${repository.folder.label} · ${branchName}`}
                          >
                            {branchName}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Restore ${branchName} branch`}
                            title={`Restore ${branchName} branch`}
                            onClick={() =>
                              applyNavigationCommand({
                                type: 'set-workspace-archived',
                                workspacePath: workspace.folder.value,
                                archived: false,
                              })
                            }
                          >
                            <RotateCcwIcon aria-hidden="true" />
                          </Button>
                        </li>
                      );
                    })}
                    {archivedConversations.map(
                      ({ conversation, repository, workspace }) =>
                        renderConversation(
                          conversation,
                          workspace,
                          false,
                          workspace.folder.value === repository.folder.value
                            ? repository.folder.label
                            : `${repository.folder.label} · ${workspace.folder.branchName ?? workspace.folder.label}`,
                          [],
                          true,
                        ),
                    )}
                  </ul>
                ) : null}
              </section>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {archiveUndo === null ? null : (
        <div
          className="absolute inset-x-3 bottom-16 z-50 flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-xs shadow-lg"
          role="status"
          aria-live="polite"
        >
          <span className="min-w-0 flex-1 truncate">
            Archived {archiveUndo.name}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              applyNavigationCommand({
                type: 'set-conversation-archived',
                conversationId: archiveUndo.id,
                archived: false,
              });
              if (archiveUndo.wasPinned) {
                applyNavigationCommand({
                  type: 'set-conversation-pinned',
                  conversationId: archiveUndo.id,
                  pinned: true,
                });
              }
              setArchiveUndo(null);
            }}
          >
            Undo
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss archive notification"
            onClick={() => setArchiveUndo(null)}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      )}

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="default"
              tooltip="Settings"
              className="h-9 bg-sidebar-settings"
              aria-label={
                primeAgentConnection === 'ready'
                  ? 'Settings'
                  : primeAgentConnection === 'connecting' ||
                      primeAgentConnection === 'reconnecting'
                    ? primeAgentConnection === 'connecting'
                      ? 'Ernie Connecting'
                      : 'Ernie Reconnecting'
                    : 'Ernie Prime Agent unavailable'
              }
              isActive={settingsOpen}
              onClick={() => {
                if (primeAgentConnection === 'unavailable') {
                  setConnectionDetailsOpen(true);
                  return;
                }
                onOpenSettings();
              }}
            >
              <img
                src="./ernie-logo.png"
                alt=""
                className="size-6 rounded-md object-cover"
              />
              <span className="min-w-0 flex-1 truncate font-medium">Ernie</span>
              {primeAgentConnection === 'ready' ? null : (
                <span
                  className="flex min-w-0 items-center gap-1.5 truncate text-[10px] text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  <span
                    aria-hidden="true"
                    className={`size-1.5 shrink-0 rounded-full ${
                      primeAgentConnection === 'connecting' ||
                      primeAgentConnection === 'reconnecting'
                        ? 'animate-pulse bg-muted-foreground motion-reduce:animate-none'
                        : 'bg-destructive'
                    }`}
                  />
                  {primeAgentConnection === 'connecting'
                    ? 'Connecting…'
                    : primeAgentConnection === 'reconnecting'
                      ? 'Reconnecting…'
                      : 'Prime Agent unavailable'}
                </span>
              )}
              <SettingsIcon aria-hidden="true" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
      <RenameAgentConversationDialog
        busy={renamingSession}
        conversation={renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onRename={(name) => {
          if (renameTarget === null) return;
          renameSession(
            renameTarget.kind === 'live'
              ? {
                  kind: 'live',
                  activeSessionId: renameTarget.session.activeSessionId,
                  sessionPath: renameTarget.session.sessionPath,
                  name,
                }
              : {
                  kind: 'saved',
                  sessionPath: renameTarget.session.path,
                  name,
                },
          );
          setRenameTarget(null);
        }}
      />
      <RepositoryDialog
        target={repositoryDialog}
        onOpenChange={(open) => {
          if (!open) setRepositoryDialog(null);
        }}
        onRemove={(path) => {
          applyNavigationCommand({
            type: 'set-repository-hidden',
            repositoryPath: path,
            hidden: true,
          });
          if (navigationPreferences.expandedRepositoryPath === path) {
            applyNavigationCommand({
              type: 'set-expanded-repository',
              repositoryPath: null,
            });
          }
          setRepositoryDialog(null);
        }}
        onRename={(path, label) => {
          applyNavigationCommand({
            type: 'set-repository-label',
            repositoryPath: path,
            label,
          });
          setRepositoryDialog(null);
        }}
      />
      <Dialog
        open={connectionDetailsOpen}
        onOpenChange={setConnectionDetailsOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prime Agent unavailable</DialogTitle>
            <DialogDescription>
              Ernie could not reach Prime Agent. Restart Ernie, then try again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" />}>Done</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
