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
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { ThinkingOrb } from 'thinking-orbs';

import { RenameThreadDialog } from '@/components/rename-thread-dialog';
import {
  RepositoryDialog,
  type RepositoryDialogTarget,
} from '@/components/repository-dialog';
import {
  threadConversationId,
  type ThreadConversation,
} from '@/components/thread-conversation';
import { ThreadRow } from '@/components/thread-row';
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
  PrimeAgentFolderChoice,
  PrimeAgentWorkspaceController,
} from '@/hooks/use-prime-agent-workspace';
import { useThreadManagement } from '@/hooks/use-thread-management';
import type { PrimeAgentSessionActivity } from '@/packages/prime-agent-daemon/client';
import {
  hasUnseenThreadActivity,
  movePinnedThread,
  moveRepositoryThread,
  orderRepositoryPaths,
  orderRepositoryThreadIds,
  rememberRepositoryPaths,
  setExpandedRepository,
  setRepositoryHidden,
  setRepositoryLabel,
  setThreadArchived,
  setThreadPinned,
  setThreadViewedAt,
  setWorkspaceArchived,
  type ThreadManagementState,
} from '@/packages/thread-management';
import type { ThinkingOrbState } from '@/thinking-orb-preference';

type AgentSidebarProps = Pick<
  PrimeAgentWorkspaceController,
  | 'creatingAgent'
  | 'folders'
  | 'importingSessionPath'
  | 'primeAgentConnection'
  | 'renamingSession'
  | 'savedSessions'
  | 'selectedCwd'
  | 'selectedSessionId'
  | 'sessionPreviews'
  | 'sessions'
  | 'changeFolder'
  | 'addWorkspaceDirectory'
  | 'startAgentDraft'
  | 'importSession'
  | 'renameSession'
  | 'selectSession'
> & {
  readonly onOpenSettings: () => void;
  readonly settingsOpen: boolean;
  readonly thinkingOrbState: ThinkingOrbState;
};

interface WorkspaceGroup {
  readonly folder: PrimeAgentFolderChoice;
  readonly conversations: readonly ThreadConversation[];
}

interface RepositoryGroup {
  readonly folder: PrimeAgentFolderChoice;
  readonly workspaces: readonly WorkspaceGroup[];
  readonly conversations: readonly ThreadConversation[];
}

interface DraggedThread {
  readonly cwd: string;
  readonly id: string;
  readonly pinned: boolean;
}

interface LocatedConversation {
  readonly conversation: ThreadConversation;
  readonly repository: RepositoryGroup;
  readonly workspace: WorkspaceGroup;
}

interface ArchiveUndo {
  readonly id: string;
  readonly name: string;
  readonly wasPinned: boolean;
}

type SearchResult =
  | Readonly<{
      breadcrumb: string;
      key: string;
      kind: 'repository';
      label: string;
      repositoryPath: string;
    }>
  | Readonly<{
      breadcrumb: string;
      key: string;
      kind: 'worktree';
      label: string;
      repositoryPath: string;
      workspacePath: string;
    }>
  | Readonly<{
      breadcrumb: string;
      conversation: ThreadConversation;
      key: string;
      kind: 'Agent';
      label: string;
      repositoryPath: string;
    }>;

const recentSettledLimit = 3;
const collapsedPinLimit = 5;
const collapsedWorktreeLimit = 5;
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

function conversationFallbackIdentity(cwd: string, name: string): string {
  return `${cwd}\u0000${name}`;
}

function conversationLabel(
  conversation: ThreadConversation,
  sessionPreviews: Readonly<Record<string, string>>,
): string {
  return conversation.kind === 'live'
    ? (sessionPreviews[conversation.session.activeSessionId] ??
      conversation.session.name)
    : conversation.session.name;
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

function rawConversationActivity(
  conversation: ThreadConversation,
): PrimeAgentSessionActivity {
  return conversation.session.activity;
}

function conversationActivity(
  conversation: ThreadConversation,
  connected: boolean,
  management: ThreadManagementState,
): PrimeAgentSessionActivity {
  const activity = rawConversationActivity(conversation);
  if (!connected && activity !== 'settled') return 'idle';
  if (activity === 'working' || activity === 'queued') return activity;
  if (conversation.session.modifiedAt === null) return activity;
  if (
    hasUnseenThreadActivity(
      management,
      threadConversationId(conversation),
      conversation.session.modifiedAt,
    )
  ) {
    return 'needs_input';
  }
  return 'settled';
}

function activityOrder(activity: PrimeAgentSessionActivity): number {
  return {
    working: 0,
    needs_input: 1,
    queued: 2,
    idle: 3,
    settled: 4,
  }[activity];
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
          className="inline-flex items-center gap-0.5 font-medium text-sidebar-foreground"
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

function modifiedTime(conversation: ThreadConversation): number {
  const value = conversation.session.modifiedAt;
  if (value === null) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function workspaceLatestActivity(workspace: WorkspaceGroup): number {
  return Math.max(0, ...workspace.conversations.map(modifiedTime));
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
  sessionPreviews,
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
  const [renameTarget, setRenameTarget] = useState<ThreadConversation | null>(
    null,
  );
  const [repositoryDialog, setRepositoryDialog] =
    useState<RepositoryDialogTarget | null>(null);
  const [connectionDetailsOpen, setConnectionDetailsOpen] = useState(false);
  const [draggedThread, setDraggedThread] = useState<DraggedThread | null>(null);
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
  const [management, setManagement] = useThreadManagement();
  const navigationRef = useRef<HTMLDivElement>(null);
  const initializedDisclosure = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const connected = primeAgentConnection === 'ready';
  const archivedThreadIds = useMemo(
    () => new Set(management.archivedThreadIds),
    [management.archivedThreadIds],
  );
  const archivedWorkspacePaths = useMemo(
    () => new Set(management.archivedWorkspacePaths),
    [management.archivedWorkspacePaths],
  );
  const hiddenRepositoryPaths = useMemo(
    () => new Set(management.hiddenRepositoryPaths),
    [management.hiddenRepositoryPaths],
  );
  const pinnedThreadIds = useMemo(
    () => new Set(management.pinnedThreadIds),
    [management.pinnedThreadIds],
  );
  const selectedLiveSession = sessions.find(
    (session) => session.activeSessionId === selectedSessionId,
  );
  const selectedThreadId = importingSessionPath !== null
    ? `session:${importingSessionPath}`
    : selectedLiveSession === undefined
      ? null
      : threadConversationId({ kind: 'live', session: selectedLiveSession });

  useEffect(() => {
    if (
      selectedThreadId === null ||
      selectedLiveSession === undefined ||
      selectedLiveSession.modifiedAt === null
    ) {
      return;
    }
    const viewedAt = selectedLiveSession.modifiedAt;
    setManagement((current) =>
      setThreadViewedAt(
        current,
        selectedThreadId,
        viewedAt,
      ),
    );
  }, [selectedLiveSession?.modifiedAt, selectedThreadId, setManagement]);

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

  const workspaceGroups = useMemo<readonly WorkspaceGroup[]>(
    () =>
      folders.map((folder) => {
        const liveSessions = sessions.filter(
          (session) => session.cwd === folder.value,
        );
        const livePaths = new Set(
          liveSessions.flatMap((session) =>
            session.sessionPath === null ? [] : [session.sessionPath],
          ),
        );
        const pathlessLiveIdentities = new Set(
          liveSessions.flatMap((session) =>
            session.sessionPath === null
              ? [conversationFallbackIdentity(session.cwd, session.name)]
              : [],
          ),
        );
        const unordered: readonly ThreadConversation[] = [
          ...liveSessions.map(
            (session): ThreadConversation => ({ kind: 'live', session }),
          ),
          ...savedSessions
            .filter(
              (session) =>
                session.cwd === folder.value &&
                !livePaths.has(session.path) &&
                !pathlessLiveIdentities.has(
                  conversationFallbackIdentity(session.cwd, session.name),
                ),
            )
            .map(
              (session): ThreadConversation => ({ kind: 'saved', session }),
            ),
        ];
        const byId = new Map(
          unordered.map((conversation) => [
            threadConversationId(conversation),
            conversation,
          ]),
        );
        const orderedIds = orderRepositoryThreadIds(
          management,
          folder.value,
          [...byId.keys()],
        );
        return {
          folder,
          conversations: orderedIds.flatMap((id) => {
            const conversation = byId.get(id);
            return conversation === undefined ? [] : [conversation];
          }),
        };
      }),
    [folders, management, savedSessions, sessions],
  );

  const repositories = useMemo<readonly RepositoryGroup[]>(() => {
    const grouped = new Map<string, WorkspaceGroup[]>();
    for (const workspaceGroup of workspaceGroups) {
      const current = grouped.get(workspaceGroup.folder.repositoryCwd) ?? [];
      grouped.set(workspaceGroup.folder.repositoryCwd, [
        ...current,
        workspaceGroup,
      ]);
    }

    const unordered = [...grouped.entries()].map(([repositoryCwd, workspaces]) => {
      const rootWorkspace = workspaces.find(
        (workspaceGroup) => workspaceGroup.folder.value === repositoryCwd,
      );
      const fallbackLabel =
        repositoryCwd.split(/[\\/]/u).filter(Boolean).at(-1) ?? repositoryCwd;
      const baseFolder =
        rootWorkspace?.folder ??
        ({
          branchName: null,
          label: fallbackLabel,
          repositoryCwd,
          value: repositoryCwd,
        } satisfies PrimeAgentFolderChoice);
      const folder = {
        ...baseFolder,
        label: management.repositoryLabels[repositoryCwd] ?? baseFolder.label,
      };
      const orderedWorkspaces = [...workspaces].sort((left, right) => {
        if (left.folder.value === repositoryCwd) return -1;
        if (right.folder.value === repositoryCwd) return 1;
        return (left.folder.branchName ?? left.folder.label).localeCompare(
          right.folder.branchName ?? right.folder.label,
        );
      });
      return {
        folder,
        workspaces: orderedWorkspaces,
        conversations: orderedWorkspaces.flatMap(
          (workspaceGroup) => workspaceGroup.conversations,
        ),
      };
    });
    const byPath = new Map(
      unordered.map((repository) => [repository.folder.value, repository]),
    );
    return orderRepositoryPaths(
      management,
      unordered.map((repository) => repository.folder.value),
    ).flatMap((path) => {
      const repository = byPath.get(path);
      return repository === undefined ? [] : [repository];
    });
  }, [management, workspaceGroups]);

  useEffect(() => {
    const openAllThreads = (event: globalThis.KeyboardEvent): void => {
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
    window.addEventListener('keydown', openAllThreads);
    return () => window.removeEventListener('keydown', openAllThreads);
  }, [repositories]);

  useEffect(() => {
    setManagement((current) =>
      rememberRepositoryPaths(
        current,
        repositories.map((repository) => repository.folder.value),
      ),
    );
  }, [repositories, setManagement]);

  const visibleRepositories = repositories.filter(
    (repository) => !hiddenRepositoryPaths.has(repository.folder.value),
  );

  useEffect(() => {
    if (pendingAddedCwd === null) return;
    const repository = repositoryForCwd(repositories, pendingAddedCwd);
    if (repository === null) return;
    setManagement((current) =>
      setExpandedRepository(
        {
          ...current,
          hiddenRepositoryPaths: current.hiddenRepositoryPaths.filter(
            (path) => path !== repository.folder.value,
          ),
        },
        repository.folder.value,
      ),
    );
    setPendingAddedCwd(null);
  }, [pendingAddedCwd, repositories, setManagement]);

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
    if (management.expandedRepositoryPath !== null) return;
    const selectedRepository = repositoryForCwd(visibleRepositories, selectedCwd);
    setManagement((current) =>
      setExpandedRepository(
        current,
        selectedRepository?.folder.value ??
          visibleRepositories[0]?.folder.value ??
          null,
      ),
    );
  }, [management.expandedRepositoryPath, selectedCwd, setManagement, visibleRepositories]);

  const locatedConversations = useMemo(() => {
    const located = new Map<string, LocatedConversation>();
    for (const repository of repositories) {
      for (const workspace of repository.workspaces) {
        for (const conversation of workspace.conversations) {
          located.set(threadConversationId(conversation), {
            conversation,
            repository,
            workspace,
          });
        }
      }
    }
    return located;
  }, [repositories]);

  const pinnedConversations = management.pinnedThreadIds.flatMap(
    (threadId): readonly LocatedConversation[] => {
      const located = locatedConversations.get(threadId);
      return located === undefined ||
        archivedThreadIds.has(threadId) ||
        archivedWorkspacePaths.has(located.workspace.folder.value)
        ? []
        : [located];
    },
  );
  const visiblePinnedConversations = pinsExpanded
    ? pinnedConversations
    : pinnedConversations.slice(0, collapsedPinLimit);
  const hiddenPinCount = Math.max(
    0,
    pinnedConversations.length - collapsedPinLimit,
  );
  const archivedConversations = management.archivedThreadIds.flatMap(
    (threadId): readonly LocatedConversation[] => {
      const located = locatedConversations.get(threadId);
      return located === undefined ||
        archivedWorkspacePaths.has(located.workspace.folder.value)
        ? []
        : [located];
    },
  );
  const archivedWorkspaces = repositories.flatMap((repository) =>
    repository.workspaces.flatMap((workspace) =>
      workspace.folder.value !== repository.folder.value &&
      archivedWorkspacePaths.has(workspace.folder.value)
        ? [{ repository, workspace }]
        : [],
    ),
  );

  const searchResults = useMemo<readonly SearchResult[]>(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (query.length === 0) return [];

    const results: SearchResult[] = [];
    for (const repository of repositories) {
      const repositoryHidden = hiddenRepositoryPaths.has(repository.folder.value);
      if (!repositoryHidden) {
        results.push({
          breadcrumb: repository.folder.value,
          key: `repository:${repository.folder.value}`,
          kind: 'repository',
          label: repository.folder.label,
          repositoryPath: repository.folder.value,
        });
        for (const workspace of repository.workspaces) {
          if (workspace.folder.value === repository.folder.value) continue;
          if (archivedWorkspacePaths.has(workspace.folder.value)) continue;
          results.push({
            breadcrumb: repository.folder.label,
            key: `worktree:${workspace.folder.value}`,
            kind: 'worktree',
            label: workspace.folder.branchName ?? workspace.folder.label,
            repositoryPath: repository.folder.value,
            workspacePath: workspace.folder.value,
          });
        }
      }

      for (const workspace of repository.workspaces) {
        if (archivedWorkspacePaths.has(workspace.folder.value)) continue;
        for (const conversation of workspace.conversations) {
          const id = threadConversationId(conversation);
          if (
            archivedThreadIds.has(id) ||
            (repositoryHidden && !pinnedThreadIds.has(id))
          ) {
            continue;
          }
          results.push({
            breadcrumb:
              workspace.folder.value === repository.folder.value
                ? repository.folder.label
                : `${repository.folder.label} · ${workspace.folder.branchName ?? workspace.folder.label}`,
            conversation,
            key: `Agent:${id}`,
            kind: 'Agent',
            label: conversationLabel(conversation, sessionPreviews),
            repositoryPath: repository.folder.value,
          });
        }
      }
    }

    return results
      .filter((result) =>
        `${result.label} ${result.breadcrumb}`.toLocaleLowerCase().includes(query),
      )
      .sort((left, right) => {
        const exactDifference =
          Number(right.label.toLocaleLowerCase() === query) -
          Number(left.label.toLocaleLowerCase() === query);
        if (exactDifference !== 0) return exactDifference;
        if (left.kind === 'Agent' && right.kind === 'Agent') {
          const statusDifference =
            activityOrder(
              conversationActivity(left.conversation, connected, management),
            ) -
            activityOrder(
              conversationActivity(right.conversation, connected, management),
            );
          if (statusDifference !== 0) return statusDifference;
          return modifiedTime(right.conversation) - modifiedTime(left.conversation);
        }
        if (left.kind === 'Agent') return -1;
        if (right.kind === 'Agent') return 1;
        return left.label.localeCompare(right.label);
      });
  }, [
    archivedThreadIds,
    archivedWorkspacePaths,
    connected,
    hiddenRepositoryPaths,
    pinnedThreadIds,
    repositories,
    searchQuery,
  ]);

  const clearSearch = (): void => {
    setSearchQuery('');
    setSearchOpen(false);
  };

  const openThread = (conversation: ThreadConversation): void => {
    if (conversation.kind === 'live') {
      selectSession(conversation.session.activeSessionId);
    } else {
      importSession(conversation.session.path);
    }
  };

  const moveThread = (
    cwd: string,
    conversations: readonly ThreadConversation[],
    sourceId: string,
    targetId: string,
  ): void => {
    setManagement((current) =>
      moveRepositoryThread(
        current,
        cwd,
        conversations.map(threadConversationId),
        sourceId,
        targetId,
      ),
    );
  };

  const renderThread = (
    conversation: ThreadConversation,
    workspace: WorkspaceGroup,
    pinned: boolean,
    detail: string | null,
    visibleConversations: readonly ThreadConversation[],
    archived = false,
  ): React.JSX.Element => {
    const id = threadConversationId(conversation);
    const importing =
      conversation.kind === 'saved' &&
      importingSessionPath === conversation.session.path;
    const activity = conversationActivity(conversation, connected, management);
    const label = conversationLabel(conversation, sessionPreviews);
    const conversationIndex = visibleConversations.findIndex(
      (candidate) => threadConversationId(candidate) === id,
    );
    const moveToIndex = (targetIndex: number): void => {
      const target = visibleConversations[targetIndex];
      if (target === undefined) return;
      const targetId = threadConversationId(target);
      if (pinned) {
        setManagement((current) => movePinnedThread(current, id, targetId));
      } else {
        moveThread(workspace.folder.value, visibleConversations, id, targetId);
      }
    };

    return (
      <ThreadRow
        key={id}
        activity={activity}
        archived={archived}
        detail={detail}
        disabled={importingSessionPath !== null}
        dragging={draggedThread?.id === id}
        importing={importing}
        label={label}
        pinned={pinned}
        selected={id === selectedThreadId}
        thinkingOrbState={thinkingOrbState}
        thread={conversation}
        onArchiveChange={(archived) => {
          if (archived) {
            setArchiveUndo({ id, name: conversation.session.name, wasPinned: pinned });
            setManagement((current) =>
              setThreadArchived(setThreadPinned(current, id, false), id, true),
            );
          } else {
            setManagement((current) => setThreadArchived(current, id, false));
            if (archiveUndo?.id === id) setArchiveUndo(null);
          }
        }}
        onDragEnd={() => setDraggedThread(null)}
        onDragStart={(event: DragEvent<HTMLLIElement>) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', id);
          setDraggedThread({ cwd: workspace.folder.value, id, pinned });
        }}
        onDrop={(event: DragEvent<HTMLLIElement>) => {
          event.preventDefault();
          if (draggedThread === null) return;
          if (pinned && draggedThread.pinned) {
            setManagement((current) =>
              movePinnedThread(current, draggedThread.id, id),
            );
          } else if (
            !pinned &&
            !draggedThread.pinned &&
            draggedThread.cwd === workspace.folder.value
          ) {
            moveThread(
              workspace.folder.value,
              visibleConversations,
              draggedThread.id,
              id,
            );
          }
          setDraggedThread(null);
        }}
        onOpen={() => openThread(conversation)}
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
          setManagement((current) => setThreadPinned(current, id, nextPinned))
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

        {pinnedConversations.length > 0 || draggedThread !== null ? (
          <section
            aria-label="Pinned tasks"
            className="mb-1 pb-1"
            onDragOver={(event) => {
              if (draggedThread === null || draggedThread.pinned) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedThread === null || draggedThread.pinned) return;
              setManagement((current) =>
                setThreadPinned(current, draggedThread.id, true),
              );
              setDraggedThread(null);
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
                  renderThread(
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
                              openThread(result.conversation);
                            } else {
                              setManagement((current) =>
                                setExpandedRepository(current, result.repositoryPath),
                              );
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
                  {visibleRepositories.map((repository, index) => {
                    const { folder } = repository;
                    const expanded =
                      management.expandedRepositoryPath === folder.value;
                    const repositoryActive =
                      selectedThreadId === null && selectedCwd === folder.value;
                    const repositoryActiveClass = repositoryActive
                      ? 'bg-sidebar-accent/60 aria-expanded:bg-sidebar-accent/60'
                      : 'aria-expanded:bg-transparent';
                    const conversationsId = `repository-${index}-conversations`;
                    const rootWorkspace = repository.workspaces.find(
                      (workspace) => workspace.folder.value === folder.value,
                    );
                    const unarchived = repository.workspaces
                      .filter(
                        (workspace) =>
                          !archivedWorkspacePaths.has(workspace.folder.value),
                      )
                      .flatMap((workspace) => workspace.conversations)
                      .filter(
                        (conversation) =>
                          !archivedThreadIds.has(
                            threadConversationId(conversation),
                          ),
                      );
                    const workingCount = unarchived.filter(
                      (conversation) =>
                        conversationActivity(
                          conversation,
                          connected,
                          management,
                        ) ===
                        'working',
                    ).length;
                    const needsInputCount = unarchived.filter(
                      (conversation) =>
                        conversationActivity(
                          conversation,
                          connected,
                          management,
                        ) ===
                        'needs_input',
                    ).length;
                    const settled = unarchived
                      .filter(
                        (conversation) =>
                          !pinnedThreadIds.has(threadConversationId(conversation)) &&
                          conversationActivity(
                            conversation,
                            connected,
                            management,
                          ) ===
                          'settled',
                      )
                      .sort((left, right) => modifiedTime(right) - modifiedTime(left));
                    const recentSettled = settled.slice(0, recentSettledLimit);
                    const settledExpanded = settledExpandedPaths.has(folder.value);
                    const visibleSettledIds = new Set(
                      (settledExpanded ? settled : recentSettled).map(
                        threadConversationId,
                      ),
                    );
                    const selectedSettled = settled.find(
                      (conversation) =>
                        threadConversationId(conversation) === selectedThreadId,
                    );
                    if (selectedSettled !== undefined) {
                      visibleSettledIds.add(threadConversationId(selectedSettled));
                    }
                    const hiddenSettledCount = Math.max(
                      0,
                      settled.length - recentSettledLimit,
                    );
                    const conversationsFor = (workspace: WorkspaceGroup) =>
                      workspace.conversations.filter((conversation) => {
                        const id = threadConversationId(conversation);
                        if (
                          archivedThreadIds.has(id) ||
                          pinnedThreadIds.has(id)
                        ) {
                          return false;
                        }
                        return (
                          conversationActivity(
                            conversation,
                            connected,
                            management,
                          ) !==
                            'settled' || visibleSettledIds.has(id)
                        );
                      });
                    const worktrees = repository.workspaces.filter(
                      (workspace) =>
                        workspace.folder.value !== folder.value &&
                        !archivedWorkspacePaths.has(workspace.folder.value),
                    );
                    const worktreeEntries = worktrees
                      .map((workspace, order) => {
                        const visibleConversations = conversationsFor(workspace);
                        const selectedOrRevealed =
                          workspace.folder.value === selectedCwd ||
                          workspace.folder.value === revealedWorkspaceCwd;
                        const alwaysVisible =
                          selectedOrRevealed ||
                          visibleConversations.some((conversation) => {
                            const activity = conversationActivity(
                              conversation,
                              connected,
                              management,
                            );
                            return (
                              activity === 'working' ||
                              activity === 'needs_input' ||
                              activity === 'queued' ||
                              activity === 'settled'
                            );
                          });
                        return {
                          alwaysVisible,
                          latestActivity: workspaceLatestActivity(workspace),
                          order,
                          selectedOrRevealed,
                          visibleConversations,
                          workspace,
                        };
                      })
                      .filter(
                        (entry) =>
                          entry.selectedOrRevealed ||
                          entry.visibleConversations.length > 0,
                      );
                    const alwaysVisibleWorktrees = worktreeEntries.filter(
                      (entry) => entry.alwaysVisible,
                    );
                    const quietWorktrees = worktreeEntries
                      .filter((entry) => !entry.alwaysVisible)
                      .sort(
                        (left, right) =>
                          right.latestActivity - left.latestActivity ||
                          left.order - right.order,
                      );
                    const worktreesExpanded = worktreesExpandedPaths.has(folder.value);
                    const visibleWorktrees = [
                      ...alwaysVisibleWorktrees,
                      ...(worktreesExpanded
                        ? quietWorktrees
                        : quietWorktrees.slice(0, collapsedWorktreeLimit)),
                    ].sort((left, right) => left.order - right.order);
                    const hiddenWorktreeCount = Math.max(
                      0,
                      quietWorktrees.length - collapsedWorktreeLimit,
                    );

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
                                    setManagement((current) =>
                                      setExpandedRepository(
                                        current,
                                        expanded ? null : folder.value,
                                      ),
                                    );
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
                              draggedThread?.pinned !== true ||
                              draggedThread.cwd !== folder.value
                            ) {
                              return;
                            }
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(event) => {
                            if (
                              draggedThread?.pinned !== true ||
                              draggedThread.cwd !== folder.value
                            ) {
                              return;
                            }
                            event.preventDefault();
                            setManagement((current) =>
                              setThreadPinned(current, draggedThread.id, false),
                            );
                            setDraggedThread(null);
                          }}
                        >
                          <ul className="mt-0.5 ml-4 flex min-h-0 flex-col gap-0.5 overflow-hidden">
                            {rootWorkspace === undefined
                              ? null
                              : conversationsFor(rootWorkspace).map((conversation) =>
                                  renderThread(
                                    conversation,
                                    rootWorkspace,
                                    false,
                                    sessionAge(conversation.session.modifiedAt),
                                    conversationsFor(rootWorkspace),
                                  ),
                                )}
                            {visibleWorktrees.map(
                              ({ workspace, visibleConversations }) => {
                                const workspaceLabel =
                                  workspace.folder.branchName ?? workspace.folder.label;
                                const worktreeActive =
                                  selectedThreadId === null &&
                                  selectedCwd === workspace.folder.value;
                                const workspaceUnarchived = workspace.conversations.filter(
                                  (conversation) =>
                                    !archivedThreadIds.has(
                                      threadConversationId(conversation),
                                    ),
                                );
                                const workspaceWorkingCount = workspaceUnarchived.filter(
                                  (conversation) =>
                                    conversationActivity(
                                      conversation,
                                      connected,
                                      management,
                                    ) ===
                                    'working',
                                ).length;
                                const workspaceNeedsInputCount = workspaceUnarchived.filter(
                                  (conversation) =>
                                    conversationActivity(
                                      conversation,
                                      connected,
                                      management,
                                    ) ===
                                    'needs_input',
                                ).length;
                                return (
                                  <li
                                    key={workspace.folder.value}
                                    aria-label={`${workspaceLabel} worktree`}
                                    className="mt-1"
                                    onDragOver={(event) => {
                                      if (
                                        draggedThread?.pinned !== true ||
                                        draggedThread.cwd !== workspace.folder.value
                                      ) {
                                        return;
                                      }
                                      event.preventDefault();
                                      event.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      if (
                                        draggedThread?.pinned !== true ||
                                        draggedThread.cwd !== workspace.folder.value
                                      ) {
                                        return;
                                      }
                                      setManagement((current) =>
                                        setThreadPinned(
                                          current,
                                          draggedThread.id,
                                          false,
                                        ),
                                      );
                                      setDraggedThread(null);
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
                                            setManagement((current) =>
                                              setWorkspaceArchived(
                                                current,
                                                workspace.folder.value,
                                                true,
                                              ),
                                            )
                                          }
                                        >
                                          <ArchiveIcon />
                                          Archive branch
                                        </ContextMenuItem>
                                      </ContextMenuContent>
                                    </ContextMenu>
                                    <ul className="ml-2 flex flex-col gap-0.5">
                                      {visibleConversations.map((conversation) =>
                                        renderThread(
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
                              setManagement((current) =>
                                setWorkspaceArchived(
                                  current,
                                  workspace.folder.value,
                                  false,
                                ),
                              )
                            }
                          >
                            <RotateCcwIcon aria-hidden="true" />
                          </Button>
                        </li>
                      );
                    })}
                    {archivedConversations.map(
                      ({ conversation, repository, workspace }) =>
                        renderThread(
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
              setManagement((current) => {
                const restored = setThreadArchived(current, archiveUndo.id, false);
                return archiveUndo.wasPinned
                  ? setThreadPinned(restored, archiveUndo.id, true)
                  : restored;
              });
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
              className="h-9"
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
      <RenameThreadDialog
        busy={renamingSession}
        thread={renameTarget}
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
          setManagement((current) => {
            const hidden = setRepositoryHidden(current, path, true);
            return hidden.expandedRepositoryPath === path
              ? setExpandedRepository(hidden, null)
              : hidden;
          });
          setRepositoryDialog(null);
        }}
        onRename={(path, label) => {
          setManagement((current) => setRepositoryLabel(current, path, label));
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
