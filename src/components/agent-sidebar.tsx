import {
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  ListFilterIcon,
  LoaderCircleIcon,
  PlusIcon,
  SettingsIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type DragEvent } from 'react';

import { RenameThreadDialog } from '@/components/rename-thread-dialog';
import {
  threadConversationId,
  type ThreadConversation,
} from '@/components/thread-conversation';
import { ThreadRow } from '@/components/thread-row';
import { Button } from '@/components/trovecn/ui/button';
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
import {
  moveRepositoryThread,
  orderRepositoryThreadIds,
  setRepositoryFolded,
  setThreadArchived,
  setThreadPinned,
} from '@/packages/thread-management';

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
  | 'sessions'
  | 'changeFolder'
  | 'chooseWorkspaceDirectory'
  | 'startAgentDraft'
  | 'importSession'
  | 'renameSession'
  | 'selectSession'
>;

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
}

interface LocatedConversation {
  readonly conversation: ThreadConversation;
  readonly repository: RepositoryGroup;
  readonly workspace: WorkspaceGroup;
}

interface ArchiveUndo {
  readonly id: string;
  readonly name: string;
}

function conversationFallbackIdentity(cwd: string, name: string): string {
  return `${cwd}\u0000${name}`;
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

function isActiveConversation(conversation: ThreadConversation): boolean {
  return (
    conversation.kind === 'live' && conversation.session.activity !== 'idle'
  );
}

/** Repository navigation with persistent, reversible thread management. */
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
  chooseWorkspaceDirectory,
  startAgentDraft,
  importSession,
  renameSession,
  selectSession,
}: AgentSidebarProps): React.JSX.Element {
  const [activeOnly, setActiveOnly] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ThreadConversation | null>(
    null,
  );
  const [draggedThread, setDraggedThread] = useState<DraggedThread | null>(
    null,
  );
  const [archiveUndo, setArchiveUndo] = useState<ArchiveUndo | null>(null);
  const [management, setManagement] = useThreadManagement();
  const archivedThreadIds = useMemo(
    () => new Set(management.archivedThreadIds),
    [management.archivedThreadIds],
  );
  const foldedRepositoryPaths = useMemo(
    () => new Set(management.foldedRepositoryPaths),
    [management.foldedRepositoryPaths],
  );
  const pinnedThreadIds = useMemo(
    () => new Set(management.pinnedThreadIds),
    [management.pinnedThreadIds],
  );
  const primeAgentStatus = {
    connecting: 'Prime Agent connecting…',
    ready: 'Prime Agent ready',
    unavailable: 'Prime Agent unavailable',
  }[primeAgentConnection];

  useEffect(() => {
    if (archiveUndo === null) return;
    const timeout = window.setTimeout(() => setArchiveUndo(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [archiveUndo]);

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

    return [...grouped.entries()].map(([repositoryCwd, workspaces]) => {
      const rootWorkspace = workspaces.find(
        (workspaceGroup) => workspaceGroup.folder.value === repositoryCwd,
      );
      const folder =
        rootWorkspace?.folder ??
        ({
          branchName: null,
          label:
            repositoryCwd.split(/[\\/]/u).filter(Boolean).at(-1) ??
            repositoryCwd,
          repositoryCwd,
          value: repositoryCwd,
        } satisfies PrimeAgentFolderChoice);
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
  }, [workspaceGroups]);

  const visibleRepositories = repositories.filter(
    (repository) =>
      !activeOnly ||
      repository.conversations.some(
        (conversation) =>
          isActiveConversation(conversation) &&
          !archivedThreadIds.has(threadConversationId(conversation)) &&
          !pinnedThreadIds.has(threadConversationId(conversation)),
      ),
  );
  const pinnedConversations = management.pinnedThreadIds
    .flatMap((threadId): readonly LocatedConversation[] => {
      for (const repository of repositories) {
        for (const workspaceGroup of repository.workspaces) {
          const conversation = workspaceGroup.conversations.find(
            (candidate) => threadConversationId(candidate) === threadId,
          );
          if (
            conversation !== undefined &&
            !archivedThreadIds.has(threadConversationId(conversation))
          ) {
            return [{ conversation, repository, workspace: workspaceGroup }];
          }
        }
      }
      return [];
    })
    .filter(
      ({ conversation }) => !activeOnly || isActiveConversation(conversation),
    );
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

  const openThread = (conversation: ThreadConversation): void => {
    if (conversation.kind === 'live') {
      selectSession(conversation.session.activeSessionId);
    } else {
      importSession(conversation.session.path);
    }
  };

  const renderThread = (
    conversation: ThreadConversation,
    workspaceGroup: WorkspaceGroup,
    pinned: boolean,
    archived: boolean,
    detail: string | null,
  ): React.JSX.Element => {
    const id = threadConversationId(conversation);
    const activeConversations = workspaceGroup.conversations.filter(
      (candidate) =>
        !archivedThreadIds.has(threadConversationId(candidate)) &&
        !pinnedThreadIds.has(threadConversationId(candidate)),
    );
    const importing =
      conversation.kind === 'saved' &&
      importingSessionPath === conversation.session.path;

    return (
      <ThreadRow
        key={id}
        archived={archived}
        detail={detail}
        disabled={importingSessionPath !== null}
        dragging={draggedThread?.id === id}
        importing={importing}
        pinned={pinned}
        selected={
          conversation.kind === 'live' &&
          conversation.session.activeSessionId === selectedSessionId
        }
        thread={conversation}
        onArchiveChange={(nextArchived) => {
          if (nextArchived) {
            setArchiveUndo({ id, name: conversation.session.name });
          }
          setManagement((current) => {
            const unpinned = nextArchived
              ? setThreadPinned(current, id, false)
              : current;
            return setThreadArchived(unpinned, id, nextArchived);
          });
        }}
        onDragEnd={() => setDraggedThread(null)}
        onDragStart={(event: DragEvent<HTMLLIElement>) => {
          if (archived || pinned) return;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', id);
          setDraggedThread({ cwd: workspaceGroup.folder.value, id });
        }}
        onDrop={(event: DragEvent<HTMLLIElement>) => {
          event.preventDefault();
          if (
            archived ||
            pinned ||
            draggedThread === null ||
            draggedThread.cwd !== workspaceGroup.folder.value
          ) {
            return;
          }
          moveThread(
            workspaceGroup.folder.value,
            activeConversations,
            draggedThread.id,
            id,
          );
          setDraggedThread(null);
        }}
        onOpen={() => openThread(conversation)}
        onPinChange={(nextPinned) =>
          setManagement((current) =>
            setThreadPinned(current, id, nextPinned),
          )
        }
        onRename={() => setRenameTarget(conversation)}
      />
    );
  };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-0 px-2 pb-1 pt-3">
        {pinnedConversations.length > 0 || draggedThread !== null ? (
          <section
            aria-label="Pinned tasks"
            className="mb-1 pb-1"
            onDragOver={(event) => {
              if (draggedThread === null) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedThread === null) return;
              setManagement((current) =>
                setThreadPinned(current, draggedThread.id, true),
              );
              setDraggedThread(null);
            }}
          >
            <div className="flex h-7 items-center px-2">
              <SidebarGroupLabel className="h-auto flex-1 px-0 text-[10px] font-medium tracking-[0.08em] uppercase">
                {pinnedConversations.length === 0 ? 'Drop to pin' : 'Pinned'}
              </SidebarGroupLabel>
            </div>
            <ul className="flex flex-col gap-0.5">
              {pinnedConversations.map(
                ({ conversation, repository, workspace: workspaceGroup }) =>
                renderThread(
                  conversation,
                  workspaceGroup,
                  true,
                  false,
                  workspaceGroup.folder.branchName === null
                    ? repository.folder.label
                    : `${repository.folder.label} · ${workspaceGroup.folder.branchName}`,
                ),
              )}
            </ul>
          </section>
        ) : null}

        <div className="flex h-8 items-center gap-0.5 px-2">
          <SidebarGroupLabel className="h-auto flex-1 px-0 text-[11px] font-medium tracking-[0.08em] uppercase">
            Repositories
          </SidebarGroupLabel>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={
              activeOnly ? 'Show all Agents' : 'Show active Agents'
            }
            aria-pressed={activeOnly}
            title={
              activeOnly ? 'Show all Agents' : 'Show active Agents'
            }
            onClick={() => setActiveOnly((current) => !current)}
          >
            <ListFilterIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Add repository"
            title="Add repository"
            onClick={chooseWorkspaceDirectory}
          >
            <FolderPlusIcon aria-hidden="true" />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <ul className="flex flex-col gap-1">
              {visibleRepositories.map((repository, index) => {
                const { folder } = repository;
                const folded = foldedRepositoryPaths.has(folder.value);
                const conversationsId = `repository-${index}-conversations`;
                const rootWorkspace = repository.workspaces.find(
                  (workspaceGroup) =>
                    workspaceGroup.folder.value === folder.value,
                );
                const worktrees = repository.workspaces.filter(
                  (workspaceGroup) =>
                    workspaceGroup.folder.value !== folder.value,
                );
                const activeFor = (workspaceGroup: WorkspaceGroup) =>
                  workspaceGroup.conversations.filter(
                    (conversation) =>
                      (!activeOnly || isActiveConversation(conversation)) &&
                      !archivedThreadIds.has(
                        threadConversationId(conversation),
                      ) &&
                      !pinnedThreadIds.has(threadConversationId(conversation)),
                  );
                return (
                  <li key={folder.value} aria-label={`${folder.label} repository`}>
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 min-w-0 flex-1 justify-start gap-2 px-2 text-[13px] font-medium"
                        aria-label={folder.label}
                        aria-controls={conversationsId}
                        aria-expanded={!folded}
                        onClick={() =>
                          setManagement((current) =>
                            setRepositoryFolded(current, folder.value, !folded),
                          )
                        }
                      >
                        <ChevronRightIcon
                          aria-hidden="true"
                          className="transition-transform duration-150 data-[expanded=true]:rotate-90 motion-reduce:transition-none"
                          data-expanded={!folded}
                        />
                        <FolderIcon aria-hidden="true" />
                        <span className="truncate">{folder.label}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`New Agent in ${folder.label}`}
                        title={`New Agent in ${folder.label}`}
                        disabled={creatingAgent}
                        onClick={() => startAgentDraft(folder.value)}
                      >
                        {creatingAgent && selectedCwd === folder.value ? (
                          <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                        ) : (
                          <PlusIcon aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                    <ul
                      id={conversationsId}
                      hidden={folded}
                      className="mt-0.5 ml-4 flex flex-col gap-0.5"
                    >
                      {rootWorkspace === undefined
                        ? null
                        : activeFor(rootWorkspace).map((conversation) =>
                            renderThread(
                              conversation,
                              rootWorkspace,
                              false,
                              false,
                              sessionAge(conversation.session.modifiedAt),
                            ),
                          )}
                      {worktrees.map((workspaceGroup) => {
                        const workspaceLabel =
                          workspaceGroup.folder.branchName ??
                          workspaceGroup.folder.label;
                        const workspaceConversations = activeFor(workspaceGroup);
                        return (
                          <li
                            key={workspaceGroup.folder.value}
                            aria-label={`${workspaceLabel} worktree`}
                            className="mt-1"
                          >
                            <div className="flex h-7 items-center gap-0.5 px-2">
                              <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                                {workspaceLabel}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`New Agent in ${workspaceLabel}`}
                                title={`New Agent in ${workspaceLabel}`}
                                disabled={creatingAgent}
                                onClick={() =>
                                  startAgentDraft(workspaceGroup.folder.value)
                                }
                              >
                                {creatingAgent &&
                                selectedCwd === workspaceGroup.folder.value ? (
                                  <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
                                ) : (
                                  <PlusIcon aria-hidden="true" />
                                )}
                              </Button>
                            </div>
                            <ul className="ml-2 flex flex-col gap-0.5">
                              {workspaceConversations.map((conversation) =>
                                renderThread(
                                  conversation,
                                  workspaceGroup,
                                  false,
                                  false,
                                  sessionAge(conversation.session.modifiedAt),
                                ),
                              )}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {archiveUndo === null ? null : (
        <div
          className="fixed bottom-16 left-3 z-50 flex w-64 items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar px-3 py-2 text-xs shadow-lg"
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
              setManagement((current) =>
                setThreadArchived(current, archiveUndo.id, false),
              );
              setArchiveUndo(null);
            }}
          >
            Undo
          </Button>
        </div>
      )}

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Settings">
              <img
                src="./ernie-logo.png"
                alt=""
                className="size-8 rounded-lg object-cover"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">Ernie</span>
                <span
                  className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  <span
                    aria-hidden="true"
                    className={`size-1.5 shrink-0 rounded-full ${
                      primeAgentConnection === 'ready'
                        ? 'bg-emerald-500'
                        : primeAgentConnection === 'connecting'
                          ? 'animate-pulse bg-muted-foreground motion-reduce:animate-none'
                          : 'bg-destructive'
                    }`}
                  />
                  {primeAgentStatus}
                </span>
              </span>
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
    </Sidebar>
  );
}
