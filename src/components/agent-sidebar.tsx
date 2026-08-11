import {
  ArchiveRestoreIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  ListFilterIcon,
  LoaderCircleIcon,
  PlusIcon,
  SettingsIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { ImportSessionSheet } from '@/components/import-session-sheet';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import type {
  PrimeAgentFolderChoice,
  PrimeAgentWorkspaceController,
} from '@/hooks/use-prime-agent-workspace';
import type {
  PrimeAgentSavedSession,
  PrimeAgentSession,
} from '@/packages/prime-agent-daemon/client';

type AgentSidebarProps = Pick<
  PrimeAgentWorkspaceController,
  | 'creatingAgent'
  | 'folders'
  | 'importingSessionPath'
  | 'loadingSavedSessions'
  | 'savedSessions'
  | 'selectedCwd'
  | 'selectedSessionId'
  | 'sessions'
  | 'changeFolder'
  | 'chooseWorkspaceDirectory'
  | 'createAgent'
  | 'importSession'
  | 'loadSavedSessions'
  | 'selectSession'
>;

interface RepositoryGroup {
  readonly folder: PrimeAgentFolderChoice;
  readonly conversations: readonly RepositoryConversation[];
}

type RepositoryConversation =
  | Readonly<{ kind: 'live'; session: PrimeAgentSession }>
  | Readonly<{ kind: 'saved'; session: PrimeAgentSavedSession }>;

function conversationIdentity(cwd: string, name: string): string {
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

/** Repository navigation with nested, durable Agent conversations. */
export function AgentSidebar({
  creatingAgent,
  folders,
  importingSessionPath,
  loadingSavedSessions,
  savedSessions,
  selectedCwd,
  selectedSessionId,
  sessions,
  changeFolder,
  chooseWorkspaceDirectory,
  createAgent,
  importSession,
  loadSavedSessions,
  selectSession,
}: AgentSidebarProps): React.JSX.Element {
  const [activeOnly, setActiveOnly] = useState(false);
  const [foldedRepositories, setFoldedRepositories] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [importOpen, setImportOpen] = useState(false);
  const repositories = useMemo<readonly RepositoryGroup[]>(
    () =>
      folders
        .map((folder) => {
          const liveSessions = sessions.filter(
            (session) => session.cwd === folder.value,
          );
          const liveIdentities = new Set(
            liveSessions.map((session) =>
              conversationIdentity(session.cwd, session.name),
            ),
          );
          return {
            folder,
            conversations: [
              ...liveSessions.map(
                (session): RepositoryConversation => ({
                  kind: 'live',
                  session,
                }),
              ),
              ...savedSessions
                .filter(
                  (session) =>
                    session.cwd === folder.value &&
                    !liveIdentities.has(
                      conversationIdentity(session.cwd, session.name),
                    ),
                )
                .map(
                  (session): RepositoryConversation => ({
                    kind: 'saved',
                    session,
                  }),
                ),
            ],
          };
        })
        .filter(
          (repository) =>
            !activeOnly || repository.conversations.length > 0,
        ),
    [activeOnly, folders, savedSessions, sessions],
  );

  const toggleRepository = (folderPath: string): void => {
    setFoldedRepositories((current) => {
      const next = new Set(current);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-3 pb-1 pt-4">
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className="h-8 px-2 text-sm font-medium">
            Repositories
          </SidebarGroupLabel>
          <SidebarGroupAction
            type="button"
            className="right-[4.5rem] top-1.5"
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
          </SidebarGroupAction>
          <SidebarGroupAction
            type="button"
            className="right-9 top-1.5"
            aria-label="Import Prime Agent session"
            title="Import Prime Agent session"
            onClick={() => {
              setImportOpen(true);
              loadSavedSessions();
            }}
          >
            <ArchiveRestoreIcon aria-hidden="true" />
          </SidebarGroupAction>
          <SidebarGroupAction
            type="button"
            className="top-1.5"
            aria-label="Add repository"
            title="Add repository"
            onClick={chooseWorkspaceDirectory}
          >
            <FolderPlusIcon aria-hidden="true" />
          </SidebarGroupAction>
        </SidebarGroup>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-3">
              {repositories.map(({ folder, conversations }, index) => {
                const folded = foldedRepositories.has(folder.value);
                const conversationsId = `repository-${index}-conversations`;
                return (
                  <SidebarMenuItem
                    key={folder.value}
                    aria-label={`${folder.label} repository`}
                  >
                    <SidebarMenuButton
                      type="button"
                      tooltip={folder.label}
                      className="h-8 px-2 text-[15px] font-medium"
                      aria-controls={conversationsId}
                      aria-expanded={!folded}
                      onClick={() => {
                        changeFolder(folder.value);
                        toggleRepository(folder.value);
                      }}
                    >
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="transition-transform duration-150 motion-reduce:transition-none data-[expanded=true]:rotate-90"
                        data-expanded={!folded}
                      />
                      <FolderIcon aria-hidden="true" />
                      <span>{folder.label}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      type="button"
                      showOnHover
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
                    </SidebarMenuAction>

                    <ul
                      id={conversationsId}
                      hidden={folded}
                      className="mt-0.5 flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden"
                    >
                    {conversations.map((conversation) => {
                      const { session } = conversation;
                      const age = sessionAge(session.modifiedAt);
                      const selected =
                        conversation.kind === 'live' &&
                        conversation.session.activeSessionId ===
                          selectedSessionId;
                      const importing =
                        conversation.kind === 'saved' &&
                        importingSessionPath === conversation.session.path;
                      const key =
                        conversation.kind === 'live'
                          ? `live:${conversation.session.activeSessionId}`
                          : `saved:${conversation.session.path}`;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            data-active={selected}
                            className="flex h-9 w-full min-w-0 items-center gap-2 rounded-xl pl-8 pr-2 text-left text-sm text-sidebar-foreground outline-none transition-opacity hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50 data-active:bg-sidebar-accent motion-reduce:transition-none"
                            aria-current={selected ? 'page' : undefined}
                            aria-label={
                              conversation.kind === 'saved'
                                ? `${session.name}, saved session`
                                : session.name
                            }
                            disabled={importingSessionPath !== null}
                            onClick={() => {
                              if (conversation.kind === 'live') {
                                selectSession(
                                  conversation.session.activeSessionId,
                                );
                              } else {
                                importSession(conversation.session.path);
                              }
                            }}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {session.name}
                            </span>
                            {importing ? (
                              <LoaderCircleIcon
                                className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
                                aria-label="Opening saved session"
                              />
                            ) : age === null ? null : (
                              <time
                                dateTime={session.modifiedAt ?? undefined}
                                className="shrink-0 text-xs tabular-nums text-muted-foreground"
                              >
                                {age}
                              </time>
                            )}
                          </button>
                        </li>
                      );
                    })}
                    </ul>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
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
    </Sidebar>
  );
}
