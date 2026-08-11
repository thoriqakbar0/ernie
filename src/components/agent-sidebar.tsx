import {
  FolderIcon,
  FolderPlusIcon,
  ListFilterIcon,
  LoaderCircleIcon,
  PlusIcon,
  SettingsIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';

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
import type { PrimeAgentSession } from '@/packages/prime-agent-daemon/client';

type AgentSidebarProps = Pick<
  PrimeAgentWorkspaceController,
  | 'creatingAgent'
  | 'folders'
  | 'selectedCwd'
  | 'selectedSessionId'
  | 'sessions'
  | 'changeFolder'
  | 'chooseWorkspaceDirectory'
  | 'createAgent'
  | 'selectSession'
>;

interface RepositoryGroup {
  readonly folder: PrimeAgentFolderChoice;
  readonly sessions: readonly PrimeAgentSession[];
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
  selectedCwd,
  selectedSessionId,
  sessions,
  changeFolder,
  chooseWorkspaceDirectory,
  createAgent,
  selectSession,
}: AgentSidebarProps): React.JSX.Element {
  const [activeOnly, setActiveOnly] = useState(false);
  const repositories = useMemo<readonly RepositoryGroup[]>(
    () =>
      folders
        .map((folder) => ({
          folder,
          sessions: sessions.filter((session) => session.cwd === folder.value),
        }))
        .filter((repository) => !activeOnly || repository.sessions.length > 0),
    [activeOnly, folders, sessions],
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pb-1 pt-4">
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className="h-8 px-2 text-sm font-medium">
            Repositories
          </SidebarGroupLabel>
          <SidebarGroupAction
            type="button"
            className="right-9 top-1.5"
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
            <SidebarMenu className="gap-2">
              {repositories.map(({ folder, sessions: repositorySessions }) => (
                <SidebarMenuItem key={folder.value}>
                  <SidebarMenuButton
                    type="button"
                    tooltip={folder.label}
                    className="h-8 px-2 text-[15px] font-medium"
                    onClick={() => changeFolder(folder.value)}
                  >
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

                  <ul className="mt-0.5 flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
                    {repositorySessions.map((session) => {
                      const age = sessionAge(session.modifiedAt);
                      const selected =
                        session.activeSessionId === selectedSessionId;
                      return (
                        <li key={session.activeSessionId}>
                          <button
                            type="button"
                            data-active={selected}
                            className="flex h-9 w-full min-w-0 items-center gap-2 rounded-xl pl-8 pr-2 text-left text-sm text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-active:bg-sidebar-accent"
                            aria-current={selected ? 'page' : undefined}
                            onClick={() => selectSession(session.activeSessionId)}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {session.name}
                            </span>
                            {age === null ? null : (
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
              ))}
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
    </Sidebar>
  );
}
