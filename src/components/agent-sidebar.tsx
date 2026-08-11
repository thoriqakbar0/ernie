import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  ListFilterIcon,
  LoaderCircleIcon,
  PlusIcon,
  SettingsIcon,
} from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';

import { ImportSessionSheet } from '@/components/import-session-sheet';
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
  setArchiveFolded,
  setRepositoryFolded,
  setThreadArchived,
} from '@/packages/thread-management';

type AgentSidebarProps = Pick<
  PrimeAgentWorkspaceController,
  | 'creatingAgent'
  | 'folders'
  | 'importingSessionPath'
  | 'loadingSavedSessions'
  | 'renamingSession'
  | 'savedSessions'
  | 'selectedCwd'
  | 'selectedSessionId'
  | 'sessions'
  | 'changeFolder'
  | 'chooseWorkspaceDirectory'
  | 'createAgent'
  | 'importSession'
  | 'loadSavedSessions'
  | 'renameSession'
  | 'selectSession'
>;

interface RepositoryGroup {
  readonly folder: PrimeAgentFolderChoice;
  readonly conversations: readonly ThreadConversation[];
}

interface DraggedThread {
  readonly cwd: string;
  readonly id: string;
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

/** Repository navigation with persistent, reversible thread management. */
export function AgentSidebar({
  creatingAgent,
  folders,
  importingSessionPath,
  loadingSavedSessions,
  renamingSession,
  savedSessions,
  selectedCwd,
  selectedSessionId,
  sessions,
  changeFolder,
  chooseWorkspaceDirectory,
  createAgent,
  importSession,
  loadSavedSessions,
  renameSession,
  selectSession,
}: AgentSidebarProps): React.JSX.Element {
  const [activeOnly, setActiveOnly] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ThreadConversation | null>(
    null,
  );
  const [draggedThread, setDraggedThread] = useState<DraggedThread | null>(
    null,
  );
  const [management, setManagement] = useThreadManagement();
  const archivedThreadIds = useMemo(
    () => new Set(management.archivedThreadIds),
    [management.archivedThreadIds],
  );
  const foldedRepositoryPaths = useMemo(
    () => new Set(management.foldedRepositoryPaths),
    [management.foldedRepositoryPaths],
  );

  const repositories = useMemo<readonly RepositoryGroup[]>(
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

  const visibleRepositories = repositories.filter(
    (repository) =>
      !activeOnly ||
      repository.conversations.some(
        (conversation) =>
          !archivedThreadIds.has(threadConversationId(conversation)),
      ),
  );
  const archivedConversations = repositories.flatMap((repository) =>
    repository.conversations
      .filter((conversation) =>
        archivedThreadIds.has(threadConversationId(conversation)),
      )
      .map((conversation) => ({ conversation, folder: repository.folder })),
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
    repository: RepositoryGroup,
    archived: boolean,
    detail: string | null,
  ): React.JSX.Element => {
    const id = threadConversationId(conversation);
    const activeConversations = repository.conversations.filter(
      (candidate) =>
        !archivedThreadIds.has(threadConversationId(candidate)),
    );
    const position = activeConversations.findIndex(
      (candidate) => threadConversationId(candidate) === id,
    );
    const moveBy = (offset: -1 | 1): void => {
      const target = activeConversations[position + offset];
      if (target === undefined) return;
      moveThread(
        repository.folder.value,
        activeConversations,
        id,
        threadConversationId(target),
      );
    };
    const importing =
      conversation.kind === 'saved' &&
      importingSessionPath === conversation.session.path;

    return (
      <ThreadRow
        key={id}
        archived={archived}
        canMoveDown={!archived && position < activeConversations.length - 1}
        canMoveUp={!archived && position > 0}
        detail={detail}
        disabled={importingSessionPath !== null}
        dragging={draggedThread?.id === id}
        importing={importing}
        selected={
          conversation.kind === 'live' &&
          conversation.session.activeSessionId === selectedSessionId
        }
        thread={conversation}
        onArchiveChange={(nextArchived) =>
          setManagement((current) =>
            setThreadArchived(current, id, nextArchived),
          )
        }
        onDragEnd={() => setDraggedThread(null)}
        onDragStart={(event: DragEvent<HTMLLIElement>) => {
          if (archived) return;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', id);
          setDraggedThread({ cwd: repository.folder.value, id });
        }}
        onDrop={(event: DragEvent<HTMLLIElement>) => {
          event.preventDefault();
          if (
            archived ||
            draggedThread === null ||
            draggedThread.cwd !== repository.folder.value
          ) {
            return;
          }
          moveThread(
            repository.folder.value,
            activeConversations,
            draggedThread.id,
            id,
          );
          setDraggedThread(null);
        }}
        onMoveDown={() => moveBy(1)}
        onMoveUp={() => moveBy(-1)}
        onOpen={() => openThread(conversation)}
        onRename={() => setRenameTarget(conversation)}
      />
    );
  };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-3 pb-1 pt-4">
        <div className="flex h-8 items-center gap-0.5 px-2">
          <SidebarGroupLabel className="h-auto flex-1 px-0 text-sm font-medium">
            Repositories
          </SidebarGroupLabel>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={
              activeOnly ? 'Show all repositories' : 'Show active repositories'
            }
            aria-pressed={activeOnly}
            title={
              activeOnly ? 'Show all repositories' : 'Show active repositories'
            }
            onClick={() => setActiveOnly((current) => !current)}
          >
            <ListFilterIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Import Prime Agent session"
            title="Import Prime Agent session"
            onClick={() => {
              setImportOpen(true);
              loadSavedSessions();
            }}
          >
            <ArchiveRestoreIcon aria-hidden="true" />
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
            <ul className="flex flex-col gap-3">
              {visibleRepositories.map((repository, index) => {
                const { folder } = repository;
                const folded = foldedRepositoryPaths.has(folder.value);
                const conversationsId = `repository-${index}-conversations`;
                const activeConversations = repository.conversations.filter(
                  (conversation) =>
                    !archivedThreadIds.has(threadConversationId(conversation)),
                );
                return (
                  <li key={folder.value} aria-label={`${folder.label} repository`}>
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 min-w-0 flex-1 justify-start gap-2 px-2 text-[15px] font-medium"
                        aria-label={folder.label}
                        aria-controls={conversationsId}
                        aria-expanded={!folded}
                        onClick={() => {
                          changeFolder(folder.value);
                          setManagement((current) =>
                            setRepositoryFolded(current, folder.value, !folded),
                          );
                        }}
                      >
                        <ChevronRightIcon
                          aria-hidden="true"
                          className="transition-transform duration-150 data-[expanded=true]:rotate-90 motion-reduce:transition-none"
                          data-expanded={!folded}
                        />
                        <FolderIcon aria-hidden="true" />
                        <span className="truncate">{folder.label}</span>
                        <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                          {activeConversations.length}
                        </span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`New Agent in ${folder.label}`}
                        title={`New Agent in ${folder.label}`}
                        disabled={creatingAgent}
                        onClick={() => createAgent(folder.value)}
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
                      className="mt-0.5 flex flex-col gap-0.5 pl-3"
                    >
                      {activeConversations.map((conversation) =>
                        renderThread(
                          conversation,
                          repository,
                          false,
                          sessionAge(conversation.session.modifiedAt),
                        ),
                      )}
                    </ul>
                  </li>
                );
              })}
            </ul>

            {archivedConversations.length > 0 ? (
              <div className="mt-3 border-t border-sidebar-border pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 w-full justify-start gap-2 px-2 text-sm font-medium"
                  aria-controls="archived-conversations"
                  aria-expanded={!management.archiveFolded}
                  onClick={() =>
                    setManagement((current) =>
                      setArchiveFolded(current, !current.archiveFolded),
                    )
                  }
                >
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="transition-transform duration-150 data-[expanded=true]:rotate-90 motion-reduce:transition-none"
                    data-expanded={!management.archiveFolded}
                  />
                  <ArchiveIcon aria-hidden="true" />
                  Archived
                  <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                    {archivedConversations.length}
                  </span>
                </Button>
                <ul
                  id="archived-conversations"
                  hidden={management.archiveFolded}
                  className="mt-0.5 flex flex-col gap-0.5 pl-3"
                >
                  {archivedConversations.map(({ conversation, folder }) => {
                    const repository = repositories.find(
                      (candidate) => candidate.folder.value === folder.value,
                    );
                    return repository === undefined
                      ? null
                      : renderThread(
                          conversation,
                          repository,
                          true,
                          folder.label,
                        );
                  })}
                </ul>
              </div>
            ) : null}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

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
                <span className="truncate text-xs text-muted-foreground">
                  Local Agent
                </span>
              </span>
              <SettingsIcon aria-hidden="true" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
      <ImportSessionSheet
        importingSessionPath={importingSessionPath}
        loading={loadingSavedSessions}
        open={importOpen}
        sessions={savedSessions}
        importSession={importSession}
        onOpenChange={setImportOpen}
      />
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
